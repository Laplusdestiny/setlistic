import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
