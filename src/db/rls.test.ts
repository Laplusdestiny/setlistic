import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 使い捨ての Postgres（docker / CI の service container）が必要。
// TEST_DATABASE_URL が無いときは skip する。本番の Supabase には絶対に向けないこと。
const url = process.env.TEST_DATABASE_URL;
const root = path.resolve(__dirname, "../..");

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
