import { vi } from "vitest";

// テスト用の Supabase クライアントの偽物。
// from(...).select(...).eq(...) のようなメソッドチェーンをすべて受け付け、await した時点で
// テーブルごとに設定した結果を返す。どのメソッドが何の引数で呼ばれたかは calls に残る。

export type FakeResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
};

export type Op = [method: string, ...args: unknown[]];
export type Call = { table: string; ops: Op[] };

/** 結果の指定：固定値／呼ばれた順に返す配列（最後の要素は使い回す）／チェーンの内容から決める関数 */
type Spec = FakeResult | FakeResult[] | ((ops: Op[]) => FakeResult);

const norm = (r: FakeResult) => ({ data: null, error: null, count: null, ...r });

function take(spec: Spec | undefined, ops: Op[]): FakeResult {
  if (spec === undefined) return {};
  if (typeof spec === "function") return spec(ops);
  if (Array.isArray(spec)) return spec.length > 1 ? spec.shift()! : (spec[0] ?? {});
  return spec;
}

export function fakeSupabase(
  opts: {
    tables?: Record<string, Spec>;
    rpc?: Record<string, Spec>;
    /** getClaims が返すユーザーID。null なら未ログイン */
    userId?: string | null;
  } = {},
) {
  const calls: Call[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];

  function builder(table: string) {
    const ops: Op[] = [];
    calls.push({ table, ops });
    const b: unknown = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then")
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve(norm(take(opts.tables?.[table], ops))).then(res, rej);
          return (...args: unknown[]) => {
            ops.push([String(prop), ...args]);
            return b;
          };
        },
      },
    );
    return b;
  }

  const userId = opts.userId === undefined ? "user-1" : opts.userId;
  const client = {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      return norm(take(opts.rpc?.[name], []));
    }),
    auth: {
      getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })),
      signOut: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ error: null as unknown })),
      signInWithOAuth: vi.fn(async () => ({
        data: { url: "https://accounts.example/oauth" as string | null },
        error: null as unknown,
      })),
    },
  };

  /** あるテーブルに対して、指定のメソッドが呼ばれたチェーンを探す */
  const find = (table: string, method: string) =>
    calls.filter((c) => c.table === table && c.ops.some(([m]) => m === method));
  const argsOf = (table: string, method: string) =>
    find(table, method).map((c) => c.ops.find(([m]) => m === method)!.slice(1));

  return { client, calls, rpcCalls, find, argsOf };
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>;
