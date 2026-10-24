import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  EMPTY_CONDITIONS,
  normalizeConditions,
  toRpcParams,
  type SearchConditions,
} from "../lib/search/conditions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 使い捨ての Postgres（docker / CI の service container）が必要。
// TEST_DATABASE_URL が無いときは skip する。本番の Supabase には絶対に向けないこと。
const url = process.env.TEST_DATABASE_URL;
const root = path.resolve(import.meta.dirname, "../..");

const USER_TABLES = [
  "songs",
  "tag_groups",
  "tags",
  "tag_aliases",
  "song_tags",
  "custom_fields",
  "song_field_values",
  "sing_logs",
  "saved_searches",
  "user_settings",
] as const;

class Rollback extends Error {}

describe.skipIf(!url)("RLS・招待制フック・初期データ（実DB）", () => {
  const sql = postgres(url ?? "postgres://invalid", { onnotice: () => {}, max: 4 });
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  let songA: string;

  /** 指定ユーザー（null = anon）として fn を実行し、最後に必ずロールバックする */
  async function as<T>(
    userId: string | null,
    fn: (tx: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    let result: T | undefined;
    try {
      await sql.begin(async (tx) => {
        if (userId) {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
          await tx`set local role authenticated`;
        } else {
          await tx`set local role anon`;
        }
        result = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return result as T;
  }

  /** as() と同じ権限で実行し、コミットする（後続のテストで結果を使う場合） */
  async function asCommit<T>(
    userId: string,
    fn: (tx: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    return (await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    })) as T;
  }

  const rejects = async (p: PromiseLike<unknown>) => {
    // 42501 = insufficient_privilege（RLS の with check 違反を含む）
    await expect(p).rejects.toMatchObject({ code: "42501" });
  };

  beforeAll(async () => {
    await sql.unsafe(
      "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public",
    );
    await sql.unsafe(
      "drop role if exists anon; drop role if exists authenticated; drop role if exists supabase_auth_admin",
    );
    await sql.unsafe(readFileSync(path.join(root, "supabase/tests/auth_stub.sql"), "utf8"));
    const files = readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      await sql.unsafe(readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
    }
    // ユーザー作成 → bootstrap トリガーが走る
    await sql`insert into auth.users (id, aud, role, email) values
      (${A}, 'authenticated', 'authenticated', 'a@test.invalid'),
      (${B}, 'authenticated', 'authenticated', 'b@test.invalid')`;
    const [row] =
      await sql`insert into songs (user_id, title, artist) values (${A}, 'A song', 'A artist') returning id`;
    songA = row.id;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("全ユーザーデータのテーブルでRLSが有効", async () => {
    const rows = await sql`select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'`;
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it("初回ログイン時に user_settings・タググループ・既定タグが作られる", async () => {
    const [{ tags }] = await sql`select count(*)::int as tags from tags where user_id = ${A}`;
    const [{ groups }] =
      await sql`select count(*)::int as groups from tag_groups where user_id = ${A}`;
    const [{ settings }] =
      await sql`select count(*)::int as settings from user_settings where user_id = ${A}`;
    expect({ tags, groups, settings }).toEqual({ tags: 4, groups: 4, settings: 1 });
    const names = await sql`select name from tags where user_id = ${A} order by sort_order`;
    expect(names.map((r) => r.name)).toEqual(["十八番", "歌える", "練習中", "歌いたい"]);
  });

  it("新しいユーザーはチュートリアル未完了で始まり、完了の記録は本人の行だけに書ける", async () => {
    const [st] = await sql`select tutorial_completed_at from user_settings where user_id = ${A}`;
    expect(st.tutorial_completed_at).toBeNull();
    await as(B, async (tx) => {
      const other =
        await tx`update user_settings set tutorial_completed_at = now() where user_id = ${A} returning user_id`;
      expect(other).toHaveLength(0);
      const own =
        await tx`update user_settings set tutorial_completed_at = now() where user_id = ${B} and tutorial_completed_at is null returning tutorial_completed_at`;
      expect(own).toHaveLength(1);
      expect(own[0].tutorial_completed_at).not.toBeNull();
    });
  });

  it("本人は自分の行を読み書きできる", async () => {
    await as(A, async (tx) => {
      const rows = await tx`select id from songs`;
      expect(rows).toHaveLength(1);
      await tx`insert into songs (user_id, title, artist) values (${A}, 'second', 'x')`;
      const [{ n }] = await tx`select count(*)::int as n from songs`;
      expect(n).toBe(2);
    });
  });

  it("別アカウントには他人の行が一切見えない", async () => {
    await as(B, async (tx) => {
      for (const t of USER_TABLES) {
        const [{ n }] = await tx`select count(*)::int as n from ${tx(t)} where user_id = ${A}`;
        expect(n, t).toBe(0);
      }
      const [{ n: songs }] = await tx`select count(*)::int as n from songs`;
      expect(songs).toBe(0);
      const [{ n: tags }] = await tx`select count(*)::int as n from tags`;
      expect(tags).toBe(4); // 自分の既定タグだけ
    });
  });

  it("他人の行は更新も削除もできない", async () => {
    await as(B, async (tx) => {
      const upd = await tx`update songs set title = 'hacked' where id = ${songA}`;
      const del = await tx`delete from songs where id = ${songA}`;
      expect(upd.count).toBe(0);
      expect(del.count).toBe(0);
    });
    const [row] = await sql`select title from songs where id = ${songA}`;
    expect(row.title).toBe("A song");
  });

  it("他人の user_id で行を作れない", async () => {
    await as(B, async (tx) => {
      await rejects(tx`insert into songs (user_id, title, artist) values (${A}, 'forged', 'x')`);
    });
  });

  it("中間テーブル：他人の曲・タグを自分名義で結べない", async () => {
    // 拒否されるとトランザクションが abort されるので、1ケースずつ別トランザクションで試す
    const [{ id: tagB }] = await sql`select id from tags where user_id = ${B} limit 1`;
    const [{ id: tagA }] = await sql`select id from tags where user_id = ${A} limit 1`;
    const [ownSong] =
      await sql`insert into songs (user_id, title, artist) values (${B}, 'b', 'b') returning id`;

    await as(B, (tx) =>
      rejects(
        tx`insert into song_tags (song_id, tag_id, user_id) values (${songA}, ${tagB}, ${B})`,
      ),
    );
    await as(B, (tx) =>
      rejects(
        tx`insert into song_tags (song_id, tag_id, user_id) values (${ownSong.id}, ${tagA}, ${B})`,
      ),
    );
    await as(B, (tx) =>
      rejects(tx`insert into sing_logs (user_id, song_id) values (${B}, ${songA})`),
    );
    // 自分の曲×自分のタグは通る
    await as(B, async (tx) => {
      await tx`insert into song_tags (song_id, tag_id, user_id) values (${ownSong.id}, ${tagB}, ${B})`;
    });
  });

  it("未ログイン(anon)は何も読めない", async () => {
    await as(null, async (tx) => {
      for (const t of USER_TABLES) {
        const [{ n }] = await tx`select count(*)::int as n from ${tx(t)}`;
        expect(n, t).toBe(0);
      }
    });
    await as(null, (tx) =>
      rejects(tx`insert into songs (user_id, title, artist) values (${A}, 'x', 'x')`),
    );
  });

  it("許可リストはAPIロールから読めない", async () => {
    await sql`insert into allowed_emails (email_hash) values ('dummy-hash')`;
    await as(null, async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from allowed_emails`;
      expect(n).toBe(0);
    });
    await as(A, async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from allowed_emails`;
      expect(n).toBe(0);
    });
  });

  describe("Before User Created フック", () => {
    const hook = async (email: string | null) => {
      const user = email === null ? {} : { email };
      const [{ r }] = await sql`select hook_before_user_created(${sql.json({ user })}) as r`;
      return r;
    };

    it("許可リストのメール（大文字小文字を区別しない）は通す", async () => {
      await sql`insert into allowed_emails (email_hash)
        values (encode(sha256(convert_to('owner@example.com', 'utf8')), 'hex'))`;
      expect(await hook("owner@example.com")).toEqual({});
      expect(await hook("Owner@Example.COM")).toEqual({});
    });

    it("許可リストに無い・メールなしは403で拒否", async () => {
      expect((await hook("stranger@example.com")).error.http_code).toBe(403);
      expect((await hook(null)).error.http_code).toBe(403);
    });

    it("API ロール（anon / authenticated）は実行できない", async () => {
      await as(null, (tx) => rejects(tx`select hook_before_user_created('{}'::jsonb)`));
      await as(A, (tx) => rejects(tx`select hook_before_user_created('{}'::jsonb)`));
    });
  });

  describe("register_song（曲＋タグの原子的な登録）", () => {
    const song = (over: Record<string, unknown> = {}) =>
      sql.json({
        title: "夜に駆ける",
        artist: "YOASOBI",
        source_service: "manual",
        ...over,
      } as never);

    it("曲・既存タグ・新規タグをまとめて登録し、user_id は呼び出しユーザーになる", async () => {
      await as(A, async (tx) => {
        const [{ id: tagId }] = await tx`select id from tags where name = '十八番'`;
        const [{ id }] = await tx`select register_song(
          ${song({ apple_track_id: 1001, song_key: -2, genre: "J-Pop" })},
          ${[tagId]}::uuid[],
          ${sql.json([{ name: "J-Pop", normalized: "j-pop", group: "ジャンル" }] as never)}
        ) as id`;
        const [row] = await tx`select user_id, song_key from songs where id = ${id}`;
        expect(row).toMatchObject({ user_id: A, song_key: -2 });
        const tags = await tx`select t.name, g.name as grp from song_tags st
          join tags t on t.id = st.tag_id left join tag_groups g on g.id = t.group_id
          where st.song_id = ${id} order by t.name`;
        expect(tags.map((t) => [t.name, t.grp])).toEqual([
          ["J-Pop", "ジャンル"],
          ["十八番", "歌える度"],
        ]);
      });
    });

    it("正規化名が同じ新規タグは既存タグを再利用し、重複を作らない", async () => {
      await as(A, async (tx) => {
        const newTags = (name: string) => sql.json([{ name, normalized: "rock" }] as never);
        await tx`select register_song(${song({ apple_track_id: 2001 })}, '{}'::uuid[], ${newTags("Rock")})`;
        await tx`select register_song(${song({ apple_track_id: 2002 })}, '{}'::uuid[], ${newTags("rock")})`;
        const rows = await tx`select name from tags where normalized_name = 'rock'`;
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Rock");
      });
    });

    it("同じ apple_track_id の再登録は unique 違反(23505)で、途中まで作った行も残らない", async () => {
      await as(A, async (tx) => {
        await tx`select register_song(${song({ apple_track_id: 3001 })})`;
        await tx`savepoint s`;
        await expect(
          tx`select register_song(${song({ apple_track_id: 3001 })}, '{}'::uuid[], ${sql.json([{ name: "ghost", normalized: "ghost" }] as never)})`,
        ).rejects.toMatchObject({ code: "23505" });
        await tx`rollback to savepoint s`;
        const ghost = await tx`select 1 from tags where normalized_name = 'ghost'`;
        expect(ghost).toHaveLength(0);
      });
    });

    it("手動登録(apple_track_id なし)は同じ曲名でも複数登録できる", async () => {
      await as(A, async (tx) => {
        await tx`select register_song(${song()})`;
        await tx`select register_song(${song()})`;
      });
    });

    it("他人のタグIDを渡しても結べず、全体が失敗する", async () => {
      const [{ id: tagB }] = await sql`select id from tags where user_id = ${B} limit 1`;
      await as(A, (tx) =>
        rejects(tx`select register_song(${song({ apple_track_id: 4001 })}, ${[tagB]}::uuid[])`),
      );
    });

    it("曲名・アーティストが空なら拒否、未ログインも拒否", async () => {
      await as(A, async (tx) => {
        await tx`savepoint s`;
        await expect(tx`select register_song(${song({ title: "  " })})`).rejects.toMatchObject({
          code: "22023",
        });
      });
      await as(null, (tx) => rejects(tx`select register_song(${song()})`));
    });

    it("キーが範囲外なら拒否(check 制約)", async () => {
      await as(A, async (tx) => {
        await expect(tx`select register_song(${song({ song_key: 9 })})`).rejects.toMatchObject({
          code: "23514",
        });
      });
    });
  });

  describe("歌唱記録と last_sung_at / sung_count", () => {
    const stats = async (tx: postgres.TransactionSql, id: string) => {
      const [r] =
        await tx`select sung_count, last_sung_at::text as last from songs where id = ${id}`;
      return r;
    };

    it("記録を付けると回数と最後に歌った日が変わり、消すと元に戻る", async () => {
      await as(A, async (tx) => {
        const [{ id }] =
          await tx`select register_song(${sql.json({ title: "s", artist: "a" } as never)}) as id`;
        expect(await stats(tx, id)).toEqual({ sung_count: 0, last: null });

        const [l1] =
          await tx`insert into sing_logs (user_id, song_id, sung_at, ease) values (${A}, ${id}, '2026-01-10', 3) returning id`;
        const [l2] =
          await tx`insert into sing_logs (user_id, song_id, sung_at) values (${A}, ${id}, '2026-03-05') returning id`;
        expect(await stats(tx, id)).toEqual({ sung_count: 2, last: "2026-03-05" });

        await tx`delete from sing_logs where id = ${l2.id}`;
        expect(await stats(tx, id)).toEqual({ sung_count: 1, last: "2026-01-10" });

        await tx`update sing_logs set sung_at = '2026-02-01' where id = ${l1.id}`;
        expect(await stats(tx, id)).toEqual({ sung_count: 1, last: "2026-02-01" });

        await tx`delete from sing_logs where id = ${l1.id}`;
        expect(await stats(tx, id)).toEqual({ sung_count: 0, last: null });
      });
    });

    it("歌いやすさは1〜5だけ（範囲外は拒否）", async () => {
      await as(A, async (tx) => {
        const [{ id }] =
          await tx`select register_song(${sql.json({ title: "s", artist: "a" } as never)}) as id`;
        await expect(
          tx`insert into sing_logs (user_id, song_id, ease) values (${A}, ${id}, 6)`,
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("他人の曲に記録を付けられない／他人の記録は消せない", async () => {
      const [other] =
        await sql`insert into songs (user_id, title, artist) values (${A}, 'x', 'x') returning id`;
      const [log] =
        await sql`insert into sing_logs (user_id, song_id) values (${A}, ${other.id}) returning id`;
      await as(B, (tx) =>
        rejects(tx`insert into sing_logs (user_id, song_id) values (${B}, ${other.id})`),
      );
      await as(B, async (tx) => {
        const del = await tx`delete from sing_logs where id = ${log.id}`;
        expect(del.count).toBe(0);
      });
      const [s] = await sql`select sung_count from songs where id = ${other.id}`;
      expect(s.sung_count).toBe(1);
    });
  });

  describe("update_song（曲の編集）", () => {
    const patch = (over: Record<string, unknown> = {}) =>
      sql.json({
        title: "新しい曲名",
        artist: "新アーティスト",
        song_key: 3,
        memo: "メモ",
        ...over,
      } as never);

    it("曲名・アーティスト・キー・メモを更新し、タグを付け直す", async () => {
      await as(A, async (tx) => {
        const [{ id: t1 }] = await tx`select id from tags where name = '十八番'`;
        const [{ id: t2 }] = await tx`select id from tags where name = '歌える'`;
        const [{ id }] =
          await tx`select register_song(${sql.json({ title: "old", artist: "old" } as never)}, ${[t1]}::uuid[]) as id`;

        await tx`select update_song(${id}, ${patch()}, ${[t2]}::uuid[], ${sql.json([{ name: "盛り上げ", normalized: "盛り上げ" }] as never)})`;

        const [row] = await tx`select title, artist, song_key, memo from songs where id = ${id}`;
        expect(row).toEqual({
          title: "新しい曲名",
          artist: "新アーティスト",
          song_key: 3,
          memo: "メモ",
        });
        const tags =
          await tx`select t.name from song_tags st join tags t on t.id = st.tag_id where st.song_id = ${id} order by t.name`;
        expect(tags.map((t) => t.name)).toEqual(["歌える", "盛り上げ"]); // 十八番は外れる
      });
    });

    it("他人の曲は更新できない（P0002）", async () => {
      const [other] =
        await sql`insert into songs (user_id, title, artist) values (${A}, 'mine', 'a') returning id`;
      await as(B, async (tx) => {
        await expect(tx`select update_song(${other.id}, ${patch()})`).rejects.toMatchObject({
          code: "P0002",
        });
      });
      const [row] = await sql`select title from songs where id = ${other.id}`;
      expect(row.title).toBe("mine");
    });

    it("曲名が空なら拒否し、タグも変わらない", async () => {
      await as(A, async (tx) => {
        const [{ id: t1 }] = await tx`select id from tags where name = '十八番'`;
        const [{ id }] =
          await tx`select register_song(${sql.json({ title: "keep", artist: "a" } as never)}, ${[t1]}::uuid[]) as id`;
        await tx`savepoint s`;
        await expect(
          tx`select update_song(${id}, ${patch({ title: " " })}, '{}'::uuid[])`,
        ).rejects.toMatchObject({ code: "22023" });
        await tx`rollback to savepoint s`;
        const tags = await tx`select 1 from song_tags where song_id = ${id}`;
        expect(tags).toHaveLength(1);
      });
    });
  });

  describe("search_songs（検索・絞り込み）", () => {
    const S = "55555555-5555-4555-8555-555555555555"; // 検索テスト専用ユーザー
    const O = "66666666-6666-4666-8666-666666666666"; // 別ユーザー（分離の確認）
    const tag: Record<string, string> = {};
    const id: Record<string, string> = {};

    const search = async (over: Partial<SearchConditions>, userId = S) => {
      const params = toRpcParams(
        normalizeConditions({ ...EMPTY_CONDITIONS, ...over }),
        "created_desc",
      );
      return as(userId, async (tx) => {
        const rows = await tx`select * from search_songs(${sql.json(params as never)})`;
        return rows.map((r) => r.title as string);
      });
    };

    beforeAll(async () => {
      await sql`insert into auth.users (id, aud, role, email) values
        (${S}, 'authenticated', 'authenticated', 's@test.invalid'),
        (${O}, 'authenticated', 'authenticated', 'o@test.invalid')`;
      const tags = await sql`select id, name from tags where user_id = ${S}`;
      for (const t of tags) tag[t.name] = t.id;
      for (const name of ["盛り上げ", "バラード", "アニソン"]) {
        const [t] = await sql`insert into tags (user_id, name, normalized_name)
          values (${S}, ${name}, ${name}) returning id`;
        tag[name] = t.id;
      }
      await sql`insert into tag_aliases (tag_id, user_id, alias, normalized_alias)
        values (${tag["十八番"]}, ${S}, 'おはこ', 'おはこ')`;

      const mk = async (key: string, v: Record<string, unknown>, tagNames: string[] = []) => {
        const [r] =
          await sql`insert into songs (user_id, title, artist, album, genre, memo, release_date, duration_ms, song_key, last_sung_at, sung_count, created_at)
          values (${S}, ${v.title as string}, ${(v.artist as string) ?? "a"}, ${(v.album as string) ?? null},
            ${(v.genre as string) ?? null}, ${(v.memo as string) ?? null}, ${(v.release as string) ?? null},
            ${(v.duration as number) ?? null}, ${(v.key as number) ?? null}, null, 0, ${v.created as string})
          returning id`;
        id[key] = r.id;
        for (const t of tagNames)
          await sql`insert into song_tags (song_id, tag_id, user_id) values (${r.id}, ${tag[t]}, ${S})`;
      };
      await mk(
        "yoru",
        {
          title: "夜に駆ける",
          artist: "YOASOBI",
          album: "THE BOOK",
          genre: "J-Pop",
          release: "2019-12-15",
          duration: 261000,
          key: -2,
          created: "2026-01-01",
          memo: "サビ前で息継ぎ",
        },
        ["十八番", "盛り上げ"],
      );
      await mk(
        "zankoku",
        {
          title: "残酷な天使のテーゼ",
          artist: "高橋洋子",
          genre: "アニメ",
          release: "1995-10-25",
          duration: 252000,
          key: 0,
          created: "2026-01-02",
        },
        ["十八番", "盛り上げ", "バラード", "アニソン"],
      );
      await mk(
        "marigold",
        {
          title: "マリーゴールド",
          artist: "あいみょん",
          genre: "J-Pop",
          release: "2018-08-08",
          duration: 290000,
          key: 1,
          created: "2026-01-03",
        },
        ["十八番", "バラード"],
      );
      await mk(
        "hakujitsu",
        {
          title: "白日",
          artist: "King Gnu",
          genre: "J-Pop",
          release: "2019-01-16",
          duration: 193000,
          key: -3,
          created: "2026-01-04",
        },
        ["練習中"],
      );
      await mk(
        "lemon",
        {
          title: "Lemon",
          artist: "米津玄師",
          genre: "J-Pop",
          release: "2018-03-14",
          duration: 255000,
          created: "2026-01-05",
        },
        ["バラード"],
      );
      await mk("short", { title: "短い曲", artist: "x", duration: 120000, created: "2026-01-06" });
      await mk("long", { title: "長い曲", artist: "y", duration: 360000, created: "2026-01-07" });
      await sql`insert into songs (user_id, title, artist) values (${O}, '別ユーザーの夜', 'x')`;
      // 歌唱記録：夜に駆ける=最新が余裕(1)、残酷な天使=最新が辛い(5)、マリーゴールド=最新が普通(3)、白日=余裕だったが前は辛かった
      const log = (song: string, date: string, ease: number) =>
        sql`insert into sing_logs (user_id, song_id, sung_at, ease) values (${S}, ${id[song]}, ${date}, ${ease})`;
      await log("yoru", "2026-03-01", 1);
      await log("zankoku", "2026-03-02", 5);
      await log("marigold", "2026-03-03", 3);
      await log("hakujitsu", "2026-02-01", 5);
      await log("hakujitsu", "2026-03-04", 2);
    });

    it("条件なしなら自分の全曲（新しい順）。他人の曲は含まれない", async () => {
      const r = await search({});
      expect(r).toHaveLength(7);
      expect(r[0]).toBe("長い曲");
      expect(r).not.toContain("別ユーザーの夜");
    });

    it("他のユーザーからは検索結果に出ない", async () => {
      expect(await search({}, O)).toEqual(["別ユーザーの夜"]);
      expect(await search({ q: "夜に駆ける" }, O)).toEqual([]);
    });

    it("タグAND：十八番 AND 盛り上げ", async () => {
      const r = await search({ tagMode: "and", include: [tag["十八番"], tag["盛り上げ"]] });
      expect(r.sort()).toEqual(["夜に駆ける", "残酷な天使のテーゼ"].sort());
    });

    it("受け入れ条件：十八番 AND 盛り上げ、ただしバラードを除く", async () => {
      const r = await search({
        tagMode: "and",
        include: [tag["十八番"], tag["盛り上げ"]],
        exclude: [tag["バラード"]],
      });
      expect(r).toEqual(["夜に駆ける"]);
    });

    it("タグOR：十八番 OR 練習中", async () => {
      const r = await search({ tagMode: "or", include: [tag["十八番"], tag["練習中"]] });
      expect(r).toHaveLength(4);
    });

    it("除外のみ：バラードを除く", async () => {
      const r = await search({ exclude: [tag["バラード"]] });
      expect(r).not.toContain("Lemon");
      expect(r).not.toContain("マリーゴールド");
      expect(r).not.toContain("残酷な天使のテーゼ");
      expect(r).toHaveLength(4);
    });

    it("フリーワードは曲名・アーティスト・アルバム・メモ・タグ名・別名を横断する", async () => {
      expect(await search({ q: "夜に" })).toEqual(["夜に駆ける"]); // 曲名
      expect(await search({ q: "king" })).toEqual(["白日"]); // アーティスト（大文字小文字）
      expect(await search({ q: "the book" })).toEqual(["夜に駆ける"]); // アルバム
      expect(await search({ q: "息継ぎ" })).toEqual(["夜に駆ける"]); // メモ
      expect((await search({ q: "アニソン" })).sort()).toEqual(["残酷な天使のテーゼ"]); // タグ名
      expect((await search({ q: "おはこ" })).sort()).toEqual(
        ["夜に駆ける", "残酷な天使のテーゼ", "マリーゴールド"].sort(),
      ); // タグの別名
    });

    it("全角英数・半角カナの揺れを吸収し、語はAND、ワイルドカード文字は文字として扱う", async () => {
      expect(await search({ q: "ＹＯＡＳＯＢＩ" })).toEqual(["夜に駆ける"]);
      expect(await search({ q: "yoasobi 夜" })).toEqual(["夜に駆ける"]);
      expect(await search({ q: "yoasobi 白日" })).toEqual([]);
      expect(await search({ q: "%" })).toEqual([]);
      expect(await search({ q: "_" })).toEqual([]);
    });

    it("アーティスト・ジャンル", async () => {
      expect(await search({ artist: "あいみょん" })).toEqual(["マリーゴールド"]);
      expect((await search({ genre: "j-pop" })).sort()).toEqual(
        ["Lemon", "マリーゴールド", "夜に駆ける", "白日"].sort(),
      );
    });

    it("リリース年代（未設定の曲は除外）", async () => {
      expect((await search({ decades: [2010] })).sort()).toEqual(
        ["Lemon", "マリーゴールド", "夜に駆ける", "白日"].sort(),
      );
      expect(await search({ decades: [1990] })).toEqual(["残酷な天使のテーゼ"]);
      expect(await search({ decades: [2020] })).toEqual([]);
    });

    it("曲の長さ", async () => {
      expect(await search({ durations: ["lt3"] })).toEqual(["短い曲"]);
      expect(await search({ durations: ["gte5"] })).toEqual(["長い曲"]);
      expect((await search({ durations: ["3to4"] })).sort()).toEqual(["白日"]);
      expect((await search({ durations: ["4to5", "gte5"] })).sort()).toEqual(
        ["Lemon", "マリーゴールド", "夜に駆ける", "残酷な天使のテーゼ", "長い曲"].sort(),
      );
    });

    it("キー", async () => {
      expect((await search({ keys: ["down"] })).sort()).toEqual(["夜に駆ける", "白日"].sort());
      expect(await search({ keys: ["zero"] })).toEqual(["残酷な天使のテーゼ"]);
      expect(await search({ keys: ["up"] })).toEqual(["マリーゴールド"]);
    });

    it("直近（最新の記録）の歌いやすさ", async () => {
      expect((await search({ lastEase: "easy" })).sort()).toEqual(["夜に駆ける", "白日"].sort()); // 白日は最新が2
      expect(await search({ lastEase: "hard" })).toEqual(["残酷な天使のテーゼ"]);
      expect(await search({ lastEase: "normal" })).toEqual(["マリーゴールド"]);
      const notHard = await search({ lastEase: "not_hard" });
      expect(notHard).not.toContain("残酷な天使のテーゼ");
      expect(notHard).toContain("Lemon"); // 記録なしは「辛かった曲を除く」に含む
    });

    it("条件の組み合わせ：Jポップかつ4分以上かつバラード", async () => {
      expect(
        await search({ genre: "j-pop", durations: ["4to5", "gte5"], include: [tag["バラード"]] }),
      ).toEqual(expect.arrayContaining(["Lemon", "マリーゴールド"]));
    });

    it("並び替え：最近歌っていない順（未歌唱が先頭）・歌った回数・曲名・アーティスト", async () => {
      await sql`update songs set last_sung_at = '2026-03-01', sung_count = 3 where id = ${id.yoru}`;
      await sql`update songs set last_sung_at = '2026-02-01', sung_count = 5 where id = ${id.hakujitsu}`;
      // 未歌唱（作成の新しい順）が先頭、そのあと最後に歌った日が古い順
      expect(await search({ sort: "last_sung_asc" })).toEqual([
        "長い曲",
        "短い曲",
        "Lemon",
        "白日",
        "夜に駆ける",
        "残酷な天使のテーゼ",
        "マリーゴールド",
      ]);
      expect((await search({ sort: "sung_count_desc" })).slice(0, 2)).toEqual([
        "白日",
        "夜に駆ける",
      ]);
      expect((await search({ sort: "title_asc" }))[0]).toBe("Lemon");
      expect((await search({ sort: "created_asc" }))[0]).toBe("夜に駆ける");
    });

    it("不正な並び順は既定（新しい順）にフォールバックする", async () => {
      const r = await as(S, async (tx) => {
        const rows = await tx`select title from search_songs('{"sort":"drop table songs"}'::jsonb)`;
        return rows.map((x) => x.title);
      });
      expect(r[0]).toBe("長い曲");
    });

    it("未ログイン(anon)は実行できない", async () => {
      await as(null, (tx) => rejects(tx`select * from search_songs('{}'::jsonb)`));
    });

    it("1,000曲でも1秒以内に絞り込める", async () => {
      await sql`insert into songs (user_id, title, artist, album, memo, release_date, duration_ms, song_key)
        select ${S}, '曲' || g, 'アーティスト' || (g % 50), 'アルバム' || (g % 100), 'メモ' || g,
               date '2000-01-01' + (g % 9000), 120000 + (g % 200) * 1000, (g % 15) - 7
        from generate_series(1, 1000) g`;
      await sql`insert into song_tags (song_id, tag_id, user_id)
        select s.id, ${tag["十八番"]}, ${S} from songs s where s.user_id = ${S} and s.title like '曲%' and right(s.title, 1) in ('1','3')`;
      const t0 = performance.now();
      const r = await search({
        q: "アーティスト1 メモ",
        include: [tag["十八番"]],
        exclude: [tag["バラード"]],
        durations: ["3to4", "4to5"],
        sort: "title_asc",
      });
      const ms = performance.now() - t0;
      expect(r.length).toBeGreaterThan(0);
      expect(ms).toBeLessThan(1000);
      const t1 = performance.now();
      expect(await search({})).toHaveLength(1007);
      expect(performance.now() - t1).toBeLessThan(1000);
    });
  });

  describe("Phase 5：カスタム項目・タグ管理・エクスポート/インポート・アカウント削除", () => {
    const U1 = "77777777-7777-4777-8777-777777777777";
    const U2 = "88888888-8888-4888-8888-888888888888";
    const U3 = "99999999-9999-4999-8999-999999999999";
    const j = (v: unknown) => sql.json(v as never);

    const mkUser = (id: string, mail: string) =>
      sql`insert into auth.users (id, aud, role, email) values (${id}, 'authenticated', 'authenticated', ${mail})`;
    const tagId = async (user: string, name: string) =>
      (await sql`select id from tags where user_id = ${user} and name = ${name}`)[0].id as string;
    const field = async (
      user: string,
      name: string,
      type: string,
      extra: Record<string, unknown> = {},
    ) => {
      const [r] =
        await sql`insert into custom_fields (user_id, name, field_type, options, show_in_list, hidden, sort_order)
        values (${user}, ${name}, ${type}, ${j(extra.options ?? null)}, ${(extra.show as boolean) ?? false}, ${(extra.hidden as boolean) ?? false}, ${(extra.order as number) ?? 0})
        returning id`;
      return r.id as string;
    };

    beforeAll(async () => {
      await mkUser(U1, "u1@test.invalid");
      await mkUser(U2, "u2@test.invalid");
      await mkUser(U3, "u3@test.invalid");
    });

    describe("カスタム項目の値", () => {
      it("登録・更新で値を保存し、null で削除、渡さなかった項目は触らない。検索結果にも含まれる", async () => {
        const fScore = await field(U1, "最高点", "number");
        const fMachine = await field(U1, "機種", "select", { options: ["DAM", "JOYSOUND"] });
        await as(U1, async (tx) => {
          const [{ id }] =
            await tx`select register_song(${j({ title: "f", artist: "a" })}, '{}'::uuid[], '[]'::jsonb,
            ${j({ [fScore]: 92, [fMachine]: "DAM" })}) as id`;
          const vals = async () =>
            (
              await tx`select f.name, v.value from song_field_values v join custom_fields f on f.id = v.field_id where v.song_id = ${id} order by f.name`
            ).map((r) => [r.name, r.value]);
          expect(await vals()).toEqual([
            ["最高点", 92],
            ["機種", "DAM"],
          ]);

          await tx`select update_song(${id}, ${j({ title: "f", artist: "a" })}, '{}'::uuid[], '[]'::jsonb, ${j({ [fScore]: 95 })})`;
          expect(await vals()).toEqual([
            ["最高点", 95],
            ["機種", "DAM"],
          ]); // 機種は触らない

          await tx`select update_song(${id}, ${j({ title: "f", artist: "a" })}, '{}'::uuid[], '[]'::jsonb, ${j({ [fMachine]: null })})`;
          expect(await vals()).toEqual([["最高点", 95]]);

          const [row] = await tx`select fields from search_songs('{}'::jsonb) where id = ${id}`;
          expect(row.fields).toEqual({ [fScore]: 95 });
        });
      });

      it("他人の項目IDは使えない（全体が失敗する）", async () => {
        const other = await field(U2, "他人の項目", "text");
        await as(U1, (tx) =>
          rejects(
            tx`select register_song(${j({ title: "x", artist: "a" })}, '{}'::uuid[], '[]'::jsonb, ${j({ [other]: "hack" })})`,
          ),
        );
      });
    });

    describe("タグの統合・削除・並べ替え", () => {
      it("統合：曲の紐づけ・別名を移し、元の名前を別名に残し、検索条件と登録時タグも付け替える", async () => {
        const mk = async (title: string, tags: string[]) => {
          const [s] =
            await sql`insert into songs (user_id, title, artist) values (${U1}, ${title}, 'a') returning id`;
          for (const t of tags) {
            const id = (await sql`select ensure_tag_by_name(${t}) as id`)[0].id;
            await sql`insert into song_tags (song_id, tag_id, user_id) values (${s.id}, ${id}, ${U1}) on conflict do nothing`;
          }
          return s.id as string;
        };
        // ensure_tag_by_name は auth.uid() を使うので、このテストでは直接タグを作る
        const mkTag = async (name: string) =>
          (
            await sql`insert into tags (user_id, name, normalized_name) values (${U1}, ${name}, ${name.toLowerCase()}) returning id`
          )[0].id as string;
        const src = await mkTag("おはこ");
        const tgt = await mkTag("得意");
        const s1 = (
          await sql`insert into songs (user_id, title, artist) values (${U1}, 'm1', 'a') returning id`
        )[0].id;
        const s2 = (
          await sql`insert into songs (user_id, title, artist) values (${U1}, 'm2', 'a') returning id`
        )[0].id;
        await sql`insert into song_tags (song_id, tag_id, user_id) values (${s1}, ${src}, ${U1}), (${s1}, ${tgt}, ${U1}), (${s2}, ${src}, ${U1})`;
        await sql`insert into tag_aliases (tag_id, user_id, alias, normalized_alias) values (${src}, ${U1}, 'おは', 'おは')`;
        await sql`update user_settings set default_tag_ids = ${[src]}::uuid[] where user_id = ${U1}`;
        await sql`insert into saved_searches (user_id, name, conditions) values (${U1}, 'q', ${j({ include: [src], exclude: [] })})`;
        void mk;

        await as(U1, async (tx) => {
          await tx`select merge_tags(${src}, ${tgt})`;
          const rows =
            await tx`select s.title, array_agg(t.name order by t.name) as tags from songs s
            join song_tags st on st.song_id = s.id join tags t on t.id = st.tag_id
            where s.title in ('m1','m2') group by s.title order by s.title`;
          expect(rows.map((r) => [r.title, r.tags])).toEqual([
            ["m1", ["得意"]],
            ["m2", ["得意"]],
          ]); // m1 は重複せず1つ
          expect(await tx`select 1 from tags where id = ${src}`).toHaveLength(0);
          const aliases =
            await tx`select alias from tag_aliases where tag_id = ${tgt} order by alias`;
          expect(aliases.map((a) => a.alias)).toEqual(["おは", "おはこ"]);
          const [st] = await tx`select default_tag_ids from user_settings where user_id = ${U1}`;
          expect(st.default_tag_ids).toEqual([tgt]);
          const [ss] = await tx`select conditions from saved_searches where name = 'q'`;
          expect(ss.conditions.include).toEqual([tgt]);
        });
      });

      it("統合：自分自身・他人のタグ・存在しないタグは拒否", async () => {
        const mine = (
          await sql`insert into tags (user_id, name, normalized_name) values (${U1}, 'mine', 'mine') returning id`
        )[0].id;
        const theirs = (
          await sql`insert into tags (user_id, name, normalized_name) values (${U2}, 'theirs', 'theirs') returning id`
        )[0].id;
        await as(U1, async (tx) => {
          await expect(tx`select merge_tags(${mine}, ${mine})`).rejects.toMatchObject({
            code: "22023",
          });
        });
        await as(U1, async (tx) => {
          await expect(tx`select merge_tags(${mine}, ${theirs})`).rejects.toMatchObject({
            code: "P0002",
          });
        });
        await as(U1, async (tx) => {
          await expect(tx`select merge_tags(${theirs}, ${mine})`).rejects.toMatchObject({
            code: "P0002",
          });
        });
        expect(await sql`select 1 from tags where id = ${theirs}`).toHaveLength(1);
      });

      it("削除：曲は残り、検索条件・登録時タグから外れる。他人のタグは消せない", async () => {
        const t = (
          await sql`insert into tags (user_id, name, normalized_name) values (${U1}, 'del', 'del') returning id`
        )[0].id;
        const keep = (
          await sql`insert into tags (user_id, name, normalized_name) values (${U1}, 'keep', 'keep') returning id`
        )[0].id;
        const song = (
          await sql`insert into songs (user_id, title, artist) values (${U1}, 'd1', 'a') returning id`
        )[0].id;
        await sql`insert into song_tags (song_id, tag_id, user_id) values (${song}, ${t}, ${U1}), (${song}, ${keep}, ${U1})`;
        await sql`update user_settings set default_tag_ids = ${[t, keep]}::uuid[] where user_id = ${U1}`;
        await sql`insert into saved_searches (user_id, name, conditions) values (${U1}, 'q2', ${j({ include: [t, keep], exclude: [t] })})`;
        const theirs = (await sql`select id from tags where user_id = ${U2} limit 1`)[0].id;

        await as(U1, async (tx) => {
          await tx`select delete_tag(${t})`;
          expect(await tx`select 1 from songs where id = ${song}`).toHaveLength(1);
          const tags =
            await tx`select t.name from song_tags st join tags t on t.id = st.tag_id where st.song_id = ${song}`;
          expect(tags.map((x) => x.name)).toEqual(["keep"]);
          const [st] = await tx`select default_tag_ids from user_settings where user_id = ${U1}`;
          expect(st.default_tag_ids).toEqual([keep]);
          const [ss] = await tx`select conditions from saved_searches where name = 'q2'`;
          expect(ss.conditions).toEqual({ include: [keep], exclude: [] });
        });
        await as(U1, async (tx) => {
          await expect(tx`select delete_tag(${theirs})`).rejects.toMatchObject({ code: "P0002" });
        });
      });

      it("並べ替え：渡した順に sort_order が付き、他人の行は動かない", async () => {
        const g = async (user: string, name: string) =>
          (
            await sql`insert into tag_groups (user_id, name, sort_order) values (${user}, ${name}, 0) returning id`
          )[0].id as string;
        const [a, b, c] = [await g(U1, "ga"), await g(U1, "gb"), await g(U1, "gc")];
        const theirs = await g(U2, "gz");
        await as(U1, async (tx) => {
          await tx`select reorder_tag_groups(${[c, a, b, theirs]}::uuid[])`;
          const rows =
            await tx`select name from tag_groups where name in ('ga','gb','gc') order by sort_order`;
          expect(rows.map((r) => r.name)).toEqual(["gc", "ga", "gb"]);
        });
        const [z] = await sql`select sort_order from tag_groups where id = ${theirs}`;
        expect(z.sort_order).toBe(0);
      });
    });

    describe("エクスポート → インポート", () => {
      // 比較用：ID・時刻など環境で変わる値を除く
      const comparable = (d: Record<string, unknown>) => {
        const { exported_at: _t, ...rest } = d;
        void _t;
        return JSON.parse(JSON.stringify(rest));
      };

      it("エクスポートしたJSONを別アカウントにインポートすると同じ内容になる", async () => {
        // U2 にひととおりのデータを作る
        await sql`insert into tag_groups (user_id, name, sort_order) values (${U2}, '独自グループ', 9) on conflict do nothing`;
        const grp = (
          await sql`select id from tag_groups where user_id = ${U2} and name = '独自グループ'`
        )[0].id;
        const tFav = await tagId(U2, "十八番");
        const tCustom = (
          await sql`insert into tags (user_id, group_id, name, normalized_name, sort_order) values (${U2}, ${grp}, 'Ｊ-ＰＯＰ', 'j-pop', 0) returning id`
        )[0].id;
        await sql`insert into tag_aliases (tag_id, user_id, alias, normalized_alias) values (${tFav}, ${U2}, 'おはこ', 'おはこ')`;
        const fNum = await field(U2, "最高点2", "number", { show: true, order: 1 });
        const fSel = await field(U2, "機種2", "select", { options: ["DAM", "JOYSOUND"], order: 2 });
        const fMulti = await field(U2, "得意な場面", "multi_select", {
          options: ["盛り上げ", "締め"],
          hidden: true,
          order: 3,
        });
        const fChk = await field(U2, "歌詞覚えた", "checkbox", { order: 4 });
        const fDate = await field(U2, "初めて歌った日", "date", { order: 5 });
        const fTxt = await field(U2, "コメント", "text", { order: 6 });

        const [s1] =
          await sql`insert into songs (user_id, apple_track_id, title, artist, album, genre, artwork_url, duration_ms, release_date, apple_url, source_service, source_url, song_key, memo, created_at)
          values (${U2}, 4242, '夜に駆ける', 'YOASOBI', 'THE BOOK', 'J-Pop', 'https://example.com/a.jpg', 261000, '2019-12-15', 'https://music.apple.com/jp/song/4242', 'apple_music', 'https://music.apple.com/jp/song/4242', -2, 'サビ前で息継ぎ', '2026-02-01T00:00:00Z') returning id`;
        const [s2] =
          await sql`insert into songs (user_id, title, artist, source_service, created_at) values (${U2}, '手入力の曲', 'x', 'manual', '2026-02-02T00:00:00Z') returning id`;
        const [s3] =
          await sql`insert into songs (user_id, title, artist, source_service, created_at) values (${U2}, '手入力の曲', 'x', 'manual', '2026-02-03T00:00:00Z') returning id`;
        void s3;
        for (const t of [tFav, tCustom])
          await sql`insert into song_tags (song_id, tag_id, user_id) values (${s1.id}, ${t}, ${U2})`;
        await sql`insert into song_field_values (song_id, field_id, user_id, value) values
          (${s1.id}, ${fNum}, ${U2}, '92'::jsonb), (${s1.id}, ${fSel}, ${U2}, '"DAM"'::jsonb),
          (${s1.id}, ${fMulti}, ${U2}, '["盛り上げ","締め"]'::jsonb), (${s1.id}, ${fChk}, ${U2}, 'true'::jsonb),
          (${s1.id}, ${fDate}, ${U2}, '"2026-01-05"'::jsonb), (${s1.id}, ${fTxt}, ${U2}, '"よい曲"'::jsonb)`;
        await sql`insert into sing_logs (user_id, song_id, sung_at, ease, note) values
          (${U2}, ${s1.id}, '2026-03-01', 2, '調子よい'), (${U2}, ${s1.id}, '2026-04-01', null, null), (${U2}, ${s2.id}, '2026-04-02', 5, null)`;
        await sql`update user_settings set list_sort = 'title_asc', list_columns = '["key"]'::jsonb, default_tag_ids = ${[tFav]}::uuid[] where user_id = ${U2}`;

        const exported = await as(U2, async (tx) => (await tx`select export_data() as d`)[0].d);
        expect(exported).toMatchObject({ app: "setlistic", version: 1 });
        expect(exported.songs).toHaveLength(3);
        expect(JSON.stringify(exported)).not.toContain(U2); // IDは含めない

        const result = await asCommit(
          U3,
          async (tx) => (await tx`select import_data(${j(exported)}) as r`)[0].r,
        );
        expect(result).toMatchObject({ songs_added: 3, songs_skipped: 0, fields_added: 7 }); // U2 の項目7つ（他のテストで作った1つを含む）

        const again = await as(U3, async (tx) => (await tx`select export_data() as d`)[0].d);
        expect(comparable(again)).toEqual(comparable(exported));

        // stats はトリガーで再計算されている
        const [stat] =
          await sql`select sung_count, last_sung_at::text as last from songs where user_id = ${U3} and apple_track_id = 4242`;
        expect(stat).toEqual({ sung_count: 2, last: "2026-04-01" });
        // 別アカウント側にはU2のIDが混ざっていない
        expect(
          await sql`select 1 from songs where user_id = ${U3} and title = '手入力の曲'`,
        ).toHaveLength(2);
      });

      it("同じJSONを再度インポートしても重複しない（曲は取り込み済み扱い、タグ・項目も増えない）", async () => {
        const exported = await as(U2, async (tx) => (await tx`select export_data() as d`)[0].d);
        const [before] =
          await sql`select (select count(*) from songs where user_id = ${U3})::int as songs, (select count(*) from tags where user_id = ${U3})::int as tags`;
        const r = await asCommit(
          U3,
          async (tx) => (await tx`select import_data(${j(exported)}) as r`)[0].r,
        );
        expect(r).toMatchObject({
          songs_added: 0,
          songs_skipped: 3,
          tags_added: 0,
          fields_added: 0,
        });
        const [after] =
          await sql`select (select count(*) from songs where user_id = ${U3})::int as songs, (select count(*) from tags where user_id = ${U3})::int as tags`;
        expect(after).toEqual(before);
      });

      it("既存のデータは消えず、型の合わない項目値は取り込まない", async () => {
        const payload = {
          custom_fields: [{ name: "最高点2", field_type: "text" }], // 既存は number。既存を再利用する
          songs: [{ title: "型違い", artist: "a", fields: { 最高点2: "文字列" } }],
        };
        const before = await sql`select count(*)::int as n from songs where user_id = ${U3}`;
        await asCommit(U3, async (tx) => {
          await tx`select import_data(${j(payload)})`;
        });
        const [v] =
          await sql`select count(*)::int as n from song_field_values v join songs s on s.id = v.song_id where s.title = '型違い' and s.user_id = ${U3}`;
        expect(v.n).toBe(0); // number 項目に文字列は入らない
        const after = await sql`select count(*)::int as n from songs where user_id = ${U3}`;
        expect(after[0].n).toBe(before[0].n + 1);
      });

      it("途中で失敗したら全体が取り消される（原子的）", async () => {
        const before =
          await sql`select (select count(*) from songs where user_id = ${U1})::int as songs, (select count(*) from tags where user_id = ${U1})::int as tags`;
        const payload = {
          tags: [{ name: "インポート途中のタグ" }],
          songs: [
            { title: "入るはずの曲", artist: "a" },
            { artist: "タイトル欠落" }, // title が null で NOT NULL 違反
          ],
        };
        await as(U1, async (tx) => {
          await expect(tx`select import_data(${j(payload)})`).rejects.toMatchObject({
            code: "23502",
          });
        });
        const after =
          await sql`select (select count(*) from songs where user_id = ${U1})::int as songs, (select count(*) from tags where user_id = ${U1})::int as tags`;
        expect(after).toEqual(before);
      });

      it("anon は実行できない", async () => {
        await as(null, (tx) => rejects(tx`select export_data()`));
        await as(null, (tx) => rejects(tx`select import_data('{}'::jsonb)`));
      });
    });

    describe("アカウント削除", () => {
      it("delete_my_account で本人のデータが全テーブルから消え、他人のデータは残る", async () => {
        const V = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        await mkUser(V, "v@test.invalid");
        const f = await field(V, "削除テスト項目", "text");
        const [s] =
          await sql`insert into songs (user_id, title, artist) values (${V}, 'bye', 'a') returning id`;
        const t = await tagId(V, "十八番");
        await sql`insert into song_tags (song_id, tag_id, user_id) values (${s.id}, ${t}, ${V})`;
        await sql`insert into song_field_values (song_id, field_id, user_id, value) values (${s.id}, ${f}, ${V}, '"x"')`;
        await sql`insert into sing_logs (user_id, song_id) values (${V}, ${s.id})`;
        await sql`insert into saved_searches (user_id, name, conditions) values (${V}, 'q', '{}')`;
        await sql`insert into tag_aliases (tag_id, user_id, alias, normalized_alias) values (${t}, ${V}, 'a', 'a')`;
        const others = await sql`select count(*)::int as n from songs where user_id <> ${V}`;

        await asCommit(V, async (tx) => {
          await tx`select delete_my_account()`;
        });

        expect(await sql`select 1 from auth.users where id = ${V}`).toHaveLength(0);
        for (const table of USER_TABLES) {
          const [{ n }] =
            await sql`select count(*)::int as n from ${sql(table)} where user_id = ${V}`;
          expect(n, table).toBe(0);
        }
        const after = await sql`select count(*)::int as n from songs where user_id <> ${V}`;
        expect(after[0].n).toBe(others[0].n);
      });

      it("他人のアカウントは消せない（呼び出し元の行だけ）／未ログインは実行不可", async () => {
        const before = await sql`select count(*)::int as n from auth.users`;
        await as(null, (tx) => rejects(tx`select delete_my_account()`));
        const after = await sql`select count(*)::int as n from auth.users`;
        expect(after[0].n).toBe(before[0].n);
      });
    });
  });

  describe("bulk_edit_song_tags（タグの一括変更）", () => {
    const j = (v: unknown) => sql.json(v as never);
    const W = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const X = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const ids: string[] = [];
    const tg: Record<string, string> = {};
    let theirTag: string;
    let theirSong: string;

    beforeAll(async () => {
      await sql`insert into auth.users (id, aud, role, email) values
        (${W}, 'authenticated', 'authenticated', 'w@test.invalid'),
        (${X}, 'authenticated', 'authenticated', 'x@test.invalid')`;
      for (const t of await sql`select id, name from tags where user_id = ${W}`) tg[t.name] = t.id;
      for (let i = 0; i < 4; i++) {
        const [s] =
          await sql`insert into songs (user_id, title, artist) values (${W}, ${"一括" + i}, 'a') returning id`;
        ids.push(s.id);
      }
      await sql`insert into song_tags (song_id, tag_id, user_id) values (${ids[0]}, ${tg["練習中"]}, ${W}), (${ids[1]}, ${tg["練習中"]}, ${W}), (${ids[1]}, ${tg["歌える"]}, ${W})`;
      theirTag = (await sql`select id from tags where user_id = ${X} limit 1`)[0].id;
      theirSong = (
        await sql`insert into songs (user_id, title, artist) values (${X}, 'x', 'x') returning id`
      )[0].id;
    });

    const tagsOf = async (tx: postgres.TransactionSql, song: string) =>
      (
        await tx`select t.name from song_tags st join tags t on t.id = st.tag_id where st.song_id = ${song} order by t.name`
      ).map((r) => r.name);

    it("既存タグ・新規タグをまとめて付け、別のタグをまとめて外す", async () => {
      await as(W, async (tx) => {
        const n =
          await tx`select bulk_edit_song_tags(${ids}::uuid[], ${[tg["十八番"]]}::uuid[], ${j([{ name: "まとめて付けた", normalized: "まとめて付けた" }])}, ${[tg["練習中"]]}::uuid[]) as n`;
        expect(n[0].n).toBe(4);
        expect(await tagsOf(tx, ids[0])).toEqual(["まとめて付けた", "十八番"]); // 練習中は外れた
        expect(await tagsOf(tx, ids[1])).toEqual(["まとめて付けた", "十八番", "歌える"]);
        expect(await tagsOf(tx, ids[3])).toEqual(["まとめて付けた", "十八番"]);
      });
    });

    it("同じ操作を繰り返しても重複しない・タグも増えない", async () => {
      await as(W, async (tx) => {
        await tx`select bulk_edit_song_tags(${ids}::uuid[], ${[tg["歌える"]]}::uuid[], ${j([{ name: "ＭＡＭＡ", normalized: "mama" }])})`;
        await tx`select bulk_edit_song_tags(${ids}::uuid[], ${[tg["歌える"]]}::uuid[], ${j([{ name: "mama", normalized: "mama" }])})`;
        const [c] = await tx`select count(*)::int as n from tags where normalized_name = 'mama'`;
        expect(c.n).toBe(1);
        const [d] =
          await tx`select count(*)::int as n from song_tags where song_id = ${ids[2]} and tag_id = ${tg["歌える"]}`;
        expect(d.n).toBe(1);
      });
    });

    it("曲がなければ 0 を返して何もしない", async () => {
      await as(W, async (tx) => {
        expect(
          (await tx`select bulk_edit_song_tags('{}'::uuid[], ${[tg["歌える"]]}::uuid[]) as n`)[0].n,
        ).toBe(0);
      });
    });

    it("他人の曲が混ざると全体が失敗し、自分の曲も変わらない", async () => {
      await as(W, async (tx) => {
        await expect(
          tx`select bulk_edit_song_tags(${[ids[0], theirSong]}::uuid[], ${[tg["歌える"]]}::uuid[])`,
        ).rejects.toMatchObject({ code: "P0002" });
      });
      const [r] =
        await sql`select count(*)::int as n from song_tags where song_id = ${ids[0]} and tag_id = ${tg["歌える"]}`;
      expect(r.n).toBe(0);
    });

    it("他人のタグIDは付けられない（全体が失敗）。他人の曲のタグも外せない", async () => {
      await as(W, (tx) =>
        rejects(tx`select bulk_edit_song_tags(${ids}::uuid[], ${[theirTag]}::uuid[])`),
      );
      await sql`insert into song_tags (song_id, tag_id, user_id) values (${theirSong}, ${theirTag}, ${X}) on conflict do nothing`;
      await as(W, async (tx) => {
        await expect(
          tx`select bulk_edit_song_tags(${[theirSong]}::uuid[], '{}'::uuid[], '[]'::jsonb, ${[theirTag]}::uuid[])`,
        ).rejects.toMatchObject({ code: "P0002" });
      });
      const [r] = await sql`select count(*)::int as n from song_tags where song_id = ${theirSong}`;
      expect(r.n).toBe(1);
    });

    it("501曲以上は拒否、未ログインも拒否", async () => {
      const many = Array.from(
        { length: 501 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      );
      await as(W, async (tx) => {
        await expect(tx`select bulk_edit_song_tags(${many}::uuid[])`).rejects.toMatchObject({
          code: "22023",
        });
      });
      await as(null, (tx) => rejects(tx`select bulk_edit_song_tags(${ids}::uuid[])`));
    });
  });

  describe("招待の管理（管理者だけ）", () => {
    const ADM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const NON = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const hashOf = (email: string) =>
      createHash("sha256").update(email.toLowerCase()).digest("hex");
    const hook = async (email: string) =>
      (
        await sql`select hook_before_user_created(${sql.json({ user: { email } } as never)}) as r`
      )[0].r;

    beforeAll(async () => {
      await sql`insert into auth.users (id, aud, role, email) values
        (${ADM}, 'authenticated', 'authenticated', 'admin@test.invalid'),
        (${NON}, 'authenticated', 'authenticated', 'non-admin@test.invalid')`;
      await sql`insert into app_admins (user_id) values (${ADM})`;
      await sql`insert into allowed_emails (email_hash) values (${hashOf("admin@test.invalid")}) on conflict do nothing`;
    });

    it("管理者でないユーザー・未ログインは、どの管理関数も使えない", async () => {
      for (const call of [
        (tx: postgres.TransactionSql) => tx`select * from admin_list_invites()`,
        (tx: postgres.TransactionSql) => tx`select admin_add_invite('x@example.com', 'x')`,
        (tx: postgres.TransactionSql) =>
          tx`select admin_revoke_invite(${hashOf("x@example.com")}, true)`,
      ]) {
        await as(NON, async (tx) => {
          await expect(call(tx)).rejects.toMatchObject({ code: "42501" });
        });
        await as(null, (tx) => rejects(call(tx)));
      }
    });

    it("is_app_admin：管理者だけ true", async () => {
      await as(ADM, async (tx) => expect((await tx`select is_app_admin() as a`)[0].a).toBe(true));
      await as(NON, async (tx) => expect((await tx`select is_app_admin() as a`)[0].a).toBe(false));
    });

    it("管理者・許可リスト自体は API ロールから読めない", async () => {
      await as(ADM, async (tx) => {
        expect((await tx`select count(*)::int as n from app_admins`)[0].n).toBe(0);
        expect((await tx`select count(*)::int as n from allowed_emails`)[0].n).toBe(0);
      });
    });

    it("招待を追加すると、フックが同じメール（大文字小文字を問わない）を通し、他は拒否する", async () => {
      const h = await asCommit(
        ADM,
        async (tx) =>
          (await tx`select admin_add_invite(${"  Friend@Example.COM "}, ${" 大学の友人 "}) as h`)[0]
            .h,
      );
      expect(h).toBe(hashOf("friend@example.com"));
      expect(await hook("friend@example.com")).toEqual({});
      expect(await hook("FRIEND@example.com")).toEqual({});
      expect((await hook("stranger@example.com")).error.http_code).toBe(403);
      const [row] = await sql`select label from allowed_emails where email_hash = ${h}`;
      expect(row.label).toBe("大学の友人"); // メモは trim される。メールアドレスそのものはどこにも保存されない
      expect(JSON.stringify(await sql`select * from allowed_emails`)).not.toContain(
        "friend@example.com",
      );
    });

    it("同じメールを再度追加するとメモだけ更新（重複しない）。メモなしなら既存を保つ", async () => {
      await asCommit(ADM, async (tx) => {
        await tx`select admin_add_invite('friend@example.com', '新しいメモ')`;
        await tx`select admin_add_invite('friend@example.com')`;
      });
      const rows =
        await sql`select label from allowed_emails where email_hash = ${hashOf("friend@example.com")}`;
      expect(rows).toEqual([{ label: "新しいメモ" }]);
    });

    it("不正なメール・長すぎるメモは拒否", async () => {
      for (const bad of [
        "",
        "no-at-sign",
        "a@b",
        "a b@c.com",
        "@c.com",
        `${"a".repeat(250)}@x.com`,
      ]) {
        await as(ADM, async (tx) => {
          await expect(tx`select admin_add_invite(${bad})`).rejects.toMatchObject({
            code: "22023",
          });
        });
      }
      await as(ADM, async (tx) => {
        await expect(
          tx`select admin_add_invite('ok@example.com', ${"あ".repeat(31)})`,
        ).rejects.toMatchObject({ code: "22023" });
      });
    });

    it("一覧：招待ごとの利用状況（未ログイン／ログイン済み）。メールアドレスは含まれない", async () => {
      await sql`update auth.users set last_sign_in_at = '2026-10-01T00:00:00Z' where id = ${NON}`;
      await asCommit(ADM, async (tx) => {
        await tx`select admin_add_invite('non-admin@test.invalid', '利用中の人')`;
      });
      const rows = await as(ADM, async (tx) => tx`select * from admin_list_invites()`);
      const byLabel = Object.fromEntries(rows.map((r) => [r.label ?? "(none)", r]));
      expect(byLabel["新しいメモ"].user_id).toBeNull(); // まだログインしていない
      expect(byLabel["利用中の人"].user_id).toBe(NON);
      expect(byLabel["利用中の人"].last_sign_in_at).toBeInstanceOf(Date);
      expect(rows.find((r) => r.is_self)?.user_id).toBe(ADM);
      expect(JSON.stringify(rows)).not.toContain("@");
    });

    it("取り消し：許可リストから消え、フックが拒否する（アカウントは残る）", async () => {
      await asCommit(ADM, async (tx) => {
        await tx`select admin_revoke_invite(${hashOf("friend@example.com")}, false)`;
      });
      expect((await hook("friend@example.com")).error.http_code).toBe(403);
    });

    it("取り消し＋アカウント削除：ユーザーと全データが消える", async () => {
      const [s] =
        await sql`insert into songs (user_id, title, artist) values (${NON}, 'bye', 'a') returning id`;
      await sql`insert into sing_logs (user_id, song_id) values (${NON}, ${s.id})`;
      await asCommit(ADM, async (tx) => {
        await tx`select admin_revoke_invite(${hashOf("non-admin@test.invalid")}, true)`;
      });
      expect(await sql`select 1 from auth.users where id = ${NON}`).toHaveLength(0);
      for (const table of USER_TABLES) {
        const [{ n }] =
          await sql`select count(*)::int as n from ${sql(table)} where user_id = ${NON}`;
        expect(n, table).toBe(0);
      }
      expect(
        await sql`select 1 from allowed_emails where email_hash = ${hashOf("non-admin@test.invalid")}`,
      ).toHaveLength(0);
    });

    it("自分自身の招待は取り消せない。不正なハッシュは拒否", async () => {
      await as(ADM, async (tx) => {
        await expect(
          tx`select admin_revoke_invite(${hashOf("admin@test.invalid")}, true)`,
        ).rejects.toMatchObject({ code: "22023" });
      });
      expect(await sql`select 1 from auth.users where id = ${ADM}`).toHaveLength(1);
      await as(ADM, async (tx) => {
        await expect(tx`select admin_revoke_invite('not-a-hash')`).rejects.toMatchObject({
          code: "22023",
        });
      });
    });

    it("招待は200件まで", async () => {
      await sql`insert into allowed_emails (email_hash) select md5(g::text) || md5((g+1)::text) from generate_series(1, 200) g on conflict do nothing`;
      await as(ADM, async (tx) => {
        await expect(tx`select admin_add_invite('overflow@example.com')`).rejects.toMatchObject({
          code: "22023",
        });
      });
      await sql`delete from allowed_emails where label is null and email_hash <> ${hashOf("admin@test.invalid")}`;
    });
  });

  describe("sing_stats（振り返りの集計）", () => {
    const Y = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
    const Z = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
    const song: Record<string, string> = {};
    let tag: string;

    beforeAll(async () => {
      await sql`insert into auth.users (id, aud, role, email) values
        (${Y}, 'authenticated', 'authenticated', 'y@test.invalid'),
        (${Z}, 'authenticated', 'authenticated', 'z@test.invalid')`;
      for (const [title, artist] of [
        ["夜に駆ける", "YOASOBI"],
        ["群青", "YOASOBI"],
        ["丸の内サディスティック", "椎名林檎"],
      ]) {
        const [s] =
          await sql`insert into songs (user_id, title, artist) values (${Y}, ${title}, ${artist}) returning id`;
        song[title] = s.id;
      }
      tag = (await sql`select id from tags where user_id = ${Y} and name = '十八番'`)[0].id;
      await sql`insert into song_tags (song_id, tag_id, user_id) values (${song["丸の内サディスティック"]}, ${tag}, ${Y})`;
      const logs: [string, string][] = [
        // 丸の内：去年に3回 → 今年は歌っていないので「ご無沙汰」
        ["丸の内サディスティック", "2025-03-01"],
        ["丸の内サディスティック", "2025-03-01"],
        ["丸の内サディスティック", "2025-06-10"],
        // 夜に駆ける：去年から歌っていて、今年2回
        ["夜に駆ける", "2025-12-20"],
        ["夜に駆ける", "2026-02-14"],
        ["夜に駆ける", "2026-10-03"],
        // 群青：今年初めて
        ["群青", "2026-10-03"],
      ];
      for (const [title, at] of logs)
        await sql`insert into sing_logs (user_id, song_id, sung_at) values (${Y}, ${song[title]}, ${at})`;
      // 他人の記録は数えない
      const [other] =
        await sql`insert into songs (user_id, title, artist) values (${Z}, '他人の曲', 'YOASOBI') returning id`;
      await sql`insert into sing_logs (user_id, song_id, sung_at) values (${Z}, ${other.id}, '2026-10-03')`;
    });

    const stats = (user: string | null, from: string | null) =>
      as(user, async (tx) => (await tx`select sing_stats(${from}, '2026-10-24') as s`)[0].s);

    it("期間内の回数・曲数・日数・初めて歌った曲数、月ごとの回数をまとめる", async () => {
      const s = await stats(Y, "2026-01-01");
      expect(s.summary).toEqual({ logs: 3, songs: 2, days: 2, firstTimes: 1 });
      expect(s.monthly).toEqual([
        { month: "2026-02", logs: 1 },
        { month: "2026-10", logs: 2 },
      ]);
      expect(s.top.map((t: { title: string; count: number }) => [t.title, t.count])).toEqual([
        ["夜に駆ける", 2],
        ["群青", 1],
      ]);
      expect(s.top[0]).toMatchObject({ artist: "YOASOBI", lastSungAt: "2026-10-03" });
      expect(s.artists).toEqual([{ artist: "YOASOBI", count: 3, songs: 2 }]);
      expect(s.tags).toEqual([]);
    });

    it("全期間なら、これまでの記録すべてを数える", async () => {
      const s = await stats(Y, null);
      expect(s.summary).toEqual({ logs: 7, songs: 3, days: 5, firstTimes: 3 });
      // 回数が同じなら、最後に歌った日が新しい曲を先に
      expect(s.top.map((t: { title: string; count: number }) => [t.title, t.count])).toEqual([
        ["夜に駆ける", 3],
        ["丸の内サディスティック", 3],
        ["群青", 1],
      ]);
      expect(s.tags).toEqual([{ id: tag, name: "十八番", count: 3, songs: 1 }]);
      expect(s.artists.map((a: { artist: string }) => a.artist)).toEqual(["YOASOBI", "椎名林檎"]);
    });

    it("ご無沙汰の曲は、期間に関係なく3回以上歌って90日以上歌っていない曲", async () => {
      const s = await stats(Y, "2026-10-01");
      expect(s.dormant).toEqual([
        {
          id: song["丸の内サディスティック"],
          title: "丸の内サディスティック",
          artist: "椎名林檎",
          count: 3,
          lastSungAt: "2025-06-10",
        },
      ]);
    });

    it("記録のない人は0と空、ログインしていなければ呼べない", async () => {
      const s = await stats(B, null);
      expect(s).toEqual({
        summary: { logs: 0, songs: 0, days: 0, firstTimes: 0 },
        monthly: [],
        top: [],
        dormant: [],
        tags: [],
        artists: [],
      });
      await as(null, (tx) => rejects(tx`select sing_stats(null, '2026-10-24')`));
    });
  });

  describe("曲数の上限（1人2,000曲）", () => {
    const L1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
    const L2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
    const j = (v: unknown) => sql.json(v as never);

    beforeAll(async () => {
      await sql`insert into auth.users (id, aud, role, email) values
        (${L1}, 'authenticated', 'authenticated', 'l1@test.invalid'),
        (${L2}, 'authenticated', 'authenticated', 'l2@test.invalid')`;
      await sql`insert into songs (user_id, title, artist) select ${L1}, 's' || g, 'a' from generate_series(1, 1999) g`;
    });

    it("上限は2,000曲。使用量と上限を song_quota で取れる", async () => {
      await as(L1, async (tx) => {
        const [q] = await tx`select song_quota() as q`;
        expect(q.q).toEqual({ used: 1999, max: 2000 });
      });
    });

    it("上限の手前までは登録でき、上限に達した次の1曲は拒否される（53400）", async () => {
      await asCommit(L1, async (tx) => {
        await tx`select register_song(${j({ title: "2000曲目", artist: "a" })})`;
      });
      await as(L1, async (tx) => {
        await expect(
          tx`select register_song(${j({ title: "2001曲目", artist: "a" })})`,
        ).rejects.toMatchObject({ code: "53400" });
      });
      const [n] = await sql`select count(*)::int as n from songs where user_id = ${L1}`;
      expect(n.n).toBe(2000);
    });

    it("直接のinsertでも超えられない（どの経路でも同じトリガーが止める）", async () => {
      await as(L1, async (tx) => {
        await expect(
          tx`insert into songs (user_id, title, artist) values (${L1}, 'x', 'x')`,
        ).rejects.toMatchObject({ code: "53400" });
      });
    });

    it("インポートで上限を超えるときは、全体が取り消される（一部だけ入らない）", async () => {
      const before = await sql`select count(*)::int as n from tags where user_id = ${L1}`;
      await as(L1, async (tx) => {
        await expect(
          tx`select import_data(${j({ tags: [{ name: "上限テストのタグ" }], songs: [{ title: "超過", artist: "a" }] })})`,
        ).rejects.toMatchObject({ code: "53400" });
      });
      const after = await sql`select count(*)::int as n from tags where user_id = ${L1}`;
      expect(after[0].n).toBe(before[0].n);
    });

    it("曲を消すと、また登録できる。他のユーザーには影響しない", async () => {
      await asCommit(L1, async (tx) => {
        await tx`delete from songs where id = (select id from songs where user_id = ${L1} limit 1)`;
        await tx`select register_song(${j({ title: "空いた枠", artist: "a" })})`;
      });
      await asCommit(L2, async (tx) => {
        await tx`select register_song(${j({ title: "別ユーザーは自分の枠", artist: "a" })})`;
      });
      const [q] = await sql`select count(*)::int as n from songs where user_id = ${L2}`;
      expect(q.n).toBe(1);
    });

    it("未ログイン(anon)は使量を取れない", async () => {
      await as(null, (tx) => rejects(tx`select song_quota()`));
    });
  });

  it("health_ping は未ログイン(anon)でも呼べて、時刻だけを返す", async () => {
    await as(null, async (tx) => {
      const [r] = await tx`select health_ping() as t`;
      expect(r.t).toBeInstanceOf(Date);
    });
    await as(A, async (tx) => {
      const [r] = await tx`select health_ping() as t`;
      expect(r.t).toBeInstanceOf(Date);
    });
  });

  it("アカウント削除で、そのユーザーの全データが消える", async () => {
    const C = "33333333-3333-4333-8333-333333333333";
    await sql`insert into auth.users (id, aud, role, email) values (${C}, 'authenticated', 'authenticated', 'c@test.invalid')`;
    const [s] =
      await sql`insert into songs (user_id, title, artist) values (${C}, 'c', 'c') returning id`;
    const [t] = await sql`select id from tags where user_id = ${C} limit 1`;
    await sql`insert into song_tags (song_id, tag_id, user_id) values (${s.id}, ${t.id}, ${C})`;
    await sql`insert into sing_logs (user_id, song_id) values (${C}, ${s.id})`;
    await sql`insert into saved_searches (user_id, name, conditions) values (${C}, 'q', '{}')`;

    await sql`delete from auth.users where id = ${C}`;

    for (const table of USER_TABLES) {
      const [{ n }] = await sql`select count(*)::int as n from ${sql(table)} where user_id = ${C}`;
      expect(n, table).toBe(0);
    }
  });
});
