import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

// ページ（Server Component）は「Suspense の中のローダーが、どんな props で画面を描くか」を確かめる。
// 画面側（クライアントコンポーネント）はそれぞれのテストで確かめている。

vi.mock("@/lib/supabase/user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  todayJst: () => "2026-10-12",
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  useRouter: () => ({}),
  usePathname: () => "/",
}));
vi.mock("next/font/google", () => ({
  Zen_Kaku_Gothic_New: () => ({ variable: "font-zen" }),
  Klee_One: () => ({ variable: "font-klee" }),
}));
vi.mock("@/app/login/actions", () => ({ signInWithGoogle: vi.fn(), signOut: vi.fn() }));
vi.mock("@/app/welcome/actions", () => ({
  completeTutorialAction: vi.fn(),
  registerFirstSongAction: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/user";
import AddPage from "./(app)/add/page";
import InvitesPage from "./(app)/admin/invites/page";
import BulkPage from "./(app)/bulk/page";
import AppLayout from "./(app)/layout";
import HomePage from "./(app)/page";
import SearchPage from "./(app)/search/page";
import SettingsPage from "./(app)/settings/page";
import SongPage from "./(app)/songs/[id]/page";
import TagsPage from "./(app)/tags/page";
import LegalLayout from "./(legal)/layout";
import PrivacyPage from "./(legal)/privacy/page";
import TermsPage from "./(legal)/terms/page";
import HelpPage from "./help/page";
import RootLayout, { metadata, viewport } from "./layout";
import LoginPage from "./login/page";
import manifest from "./manifest";
import NotFound from "./not-found";
import WelcomePage from "./welcome/page";

const SONG = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";

let sb: FakeSupabase;
function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  sb = fakeSupabase(opts);
  vi.mocked(requireUser).mockResolvedValue({ supabase: sb.client as never, userId: "user-1" });
}
beforeEach(() => setup());

/** <Suspense><Loader .../></Suspense> のローダーを実行し、返った要素の props を取り出す */
async function load(page: ReactElement) {
  const loader = (page.props as { children: ReactElement }).children;
  const el = await (loader.type as (p: unknown) => Promise<ReactElement>)(loader.props);
  return el.props as Record<string, unknown>;
}
const params = <T,>(v: T) => Promise.resolve(v);

const groups = { data: [{ id: "g1", name: "ジャンル" }] };
const tagRows = {
  data: [
    {
      id: T1,
      name: "十八番",
      group_id: "g1",
      uses: [{ count: 3 }],
      aliases: [{ alias: "b" }, { alias: "a" }],
    },
  ],
};

describe("HomePage", () => {
  it("読み込み中はセトリの骨組みを出す", () => {
    const page = HomePage({ searchParams: params({}) });
    const html = renderToStaticMarkup((page.props as { fallback: ReactElement }).fallback);
    expect(html).toContain('role="status"');
    expect(html).toContain("曲リストを読み込み中");
  });

  it("URL の条件から、存在しないタグを外して一覧を描く", async () => {
    setup({
      tables: {
        tag_groups: groups,
        tags: tagRows,
        songs: { count: 7 },
        user_settings: { data: { list_sort: "title_asc", list_columns: ["key"] } },
      },
      rpc: { search_songs: { data: [] } },
    });
    const props = await load(
      HomePage({ searchParams: params({ q: "夜", tag: `${T1},deleted`, x: ["a", "b"] }) }),
    );
    expect(props).toMatchObject({
      total: 7,
      defaultSort: "title_asc",
      listColumns: ["key"],
      groups: [{ id: "g1", name: "ジャンル" }],
      today: "2026-10-12",
    });
    expect((props.conditions as { q: string; include: string[] }).q).toBe("夜");
    expect((props.conditions as { include: string[] }).include).not.toContain("deleted");
  });

  it("チュートリアルを終えていなければチュートリアルへ送る", async () => {
    setup({ tables: { user_settings: { data: { tutorial_completed_at: null } } } });
    await expect(load(HomePage({ searchParams: params({}) }))).rejects.toThrow("REDIRECT /welcome");
  });

  it("件数が取れなければ検索結果の件数", async () => {
    setup({ rpc: { search_songs: { data: [{ id: "s1", title: "t", artist: "a" }] } } });
    const props = await load(HomePage({ searchParams: params({}) }));
    expect(props.total).toBe(1);
    expect(props.groups).toEqual([]);
  });
});

describe("AddPage", () => {
  it("共有 URL・既定のタグ・タグの別名を渡す", async () => {
    setup({
      tables: {
        tag_groups: groups,
        tags: tagRows,
        user_settings: { data: { default_tag_ids: [T1] } },
      },
      rpc: { song_quota: { data: { used: 1, max: 500 } } },
    });
    const props = await load(AddPage({ searchParams: params({ url: "x".repeat(3000) }) }));
    expect((props.initialUrl as string).length).toBe(2000);
    expect(props).toMatchObject({
      defaultTagIds: [T1],
      quota: { used: 1, max: 500 },
      tags: [{ id: T1, name: "十八番", groupId: "g1", aliases: ["b", "a"] }],
    });
  });

  it("何もなければ空", async () => {
    setup({ tables: { tags: { data: [{ id: T1, name: "x", group_id: null, aliases: null }] } } });
    const props = await load(AddPage({ searchParams: params({}) }));
    expect(props).toMatchObject({ initialUrl: "", defaultTagIds: [], quota: null, groups: [] });
    expect(props.tags).toEqual([{ id: T1, name: "x", groupId: null, aliases: [] }]);
  });
});

describe("InvitesPage", () => {
  it("管理者でなければ存在しないページとして扱う", async () => {
    await expect(load(InvitesPage())).rejects.toThrow("NOT_FOUND");
  });

  it("招待の一覧を画面の形にする", async () => {
    setup({
      rpc: {
        is_app_admin: { data: true },
        admin_list_invites: {
          data: [
            {
              email_hash: "h",
              label: "大学",
              invited_at: "2026-10-01",
              user_id: null,
              last_sign_in_at: null,
              is_self: false,
            },
          ],
        },
      },
    });
    expect((await load(InvitesPage())).invites).toEqual([
      {
        emailHash: "h",
        label: "大学",
        invitedAt: "2026-10-01",
        userId: null,
        lastSignInAt: null,
        isSelf: false,
      },
    ]);
    setup({ rpc: { is_app_admin: { data: true } } });
    expect((await load(InvitesPage())).invites).toEqual([]);
  });
});

describe("BulkPage", () => {
  it("?ids= の UUID だけを選択済みにする", async () => {
    setup({
      tables: { tag_groups: groups },
      rpc: {
        search_songs: { data: [{ id: SONG, title: "t", artist: "a", tags: null, memo: "m" }] },
      },
    });
    const props = await load(BulkPage({ searchParams: params({ ids: `${SONG},bad` }) }));
    expect(props.preselectedIds).toEqual([SONG]);
    expect(props.songs).toEqual([{ id: SONG, title: "t", artist: "a", tags: [] }]);
    expect(props.groups).toEqual([{ id: "g1", name: "ジャンル" }]);
  });

  it("ids なしなら選択なし", async () => {
    const props = await load(BulkPage({ searchParams: params({}) }));
    expect(props).toMatchObject({ preselectedIds: [], groups: [] });
  });
});

describe("SearchPage", () => {
  it("URL の条件と保存した条件を渡す", async () => {
    setup({
      tables: {
        tag_groups: groups,
        tags: tagRows,
        saved_searches: { data: [{ id: "q1", name: "x", conditions: {} }] },
      },
    });
    const props = await load(SearchPage({ searchParams: params({ q: "夜", y: ["a"] }) }));
    expect((props.initial as { q: string }).q).toBe("夜");
    expect(props.tags).toEqual([{ id: T1, name: "十八番", groupId: "g1" }]);
    expect(props.saved).toHaveLength(1);
    setup();
    expect((await load(SearchPage({ searchParams: params({}) }))).groups).toEqual([]);
  });
});

describe("SettingsPage", () => {
  it("ログイン中のメールアドレスと設定を渡す", async () => {
    setup({ tables: { tag_groups: groups }, rpc: { is_app_admin: { data: true } } });
    sb.client.auth.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "user-1", email: "me@example.com" } } as never,
    });
    const props = await load(SettingsPage());
    expect(props).toMatchObject({
      email: "me@example.com",
      isAdmin: true,
      quota: null,
      groups: [{ id: "g1", name: "ジャンル" }],
    });
  });

  it("メールアドレスがなければ空文字", async () => {
    const props = await load(SettingsPage());
    expect(props).toMatchObject({ email: "", isAdmin: false, groups: [] });
  });
});

describe("SongPage", () => {
  it("UUID でない・見つからない曲は 404", async () => {
    await expect(
      load(SongPage({ params: params({ id: "x" }), searchParams: params({}) })),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      load(SongPage({ params: params({ id: SONG }), searchParams: params({}) })),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("曲・記録・タグを渡す", async () => {
    setup({
      tables: {
        songs: {
          data: { id: SONG, title: "t", artist: "a", sung_count: 1, tags: [], field_values: [] },
        },
        tag_groups: groups,
        tags: tagRows,
      },
    });
    const props = await load(SongPage({ params: params({ id: SONG }), searchParams: params({}) }));
    expect(props).toMatchObject({
      song: { id: SONG, title: "t" },
      today: "2026-10-12",
      allTags: [{ id: T1, name: "十八番", groupId: "g1", aliases: ["b", "a"] }],
      groups: [{ id: "g1", name: "ジャンル" }],
      editing: false,
    });
    setup({ tables: { songs: { data: { id: SONG, title: "t", artist: "a", sung_count: 0 } } } });
    expect(
      (await load(SongPage({ params: params({ id: SONG }), searchParams: params({}) }))).groups,
    ).toEqual([]);
  });

  it("?edit=1 なら編集フォームを開いた状態で始める", async () => {
    setup({ tables: { songs: { data: { id: SONG, title: "t", artist: "a", sung_count: 0 } } } });
    const props = await load(
      SongPage({ params: params({ id: SONG }), searchParams: params({ edit: "1" }) }),
    );
    expect(props.editing).toBe(true);
  });
});

describe("WelcomePage", () => {
  it("?step= の手順を描く。知らない値は最初の手順", async () => {
    expect(await load(WelcomePage({ searchParams: params({ step: "register" }) }))).toEqual({
      step: "register",
      song: null,
    });
    expect(await load(WelcomePage({ searchParams: params({ step: ["x"] }) }))).toEqual({
      step: "welcome",
      song: null,
    });
  });

  it("完了の手順は登録した曲を渡す。曲が無ければ登録の手順へ", async () => {
    setup({ tables: { songs: { data: { id: SONG, title: "t", artist: "a", sung_count: 0 } } } });
    expect(await load(WelcomePage({ searchParams: params({ step: "done", song: SONG }) }))).toEqual(
      { step: "done", song: { id: SONG, title: "t", artist: "a" } },
    );

    await expect(
      load(WelcomePage({ searchParams: params({ step: "done", song: "x" }) })),
    ).rejects.toThrow("REDIRECT /welcome?step=register");
    setup();
    await expect(
      load(WelcomePage({ searchParams: params({ step: "done", song: SONG }) })),
    ).rejects.toThrow("REDIRECT /welcome?step=register");
  });
});

describe("TagsPage", () => {
  it("使用曲数と、名前順の別名を付ける", async () => {
    setup({ tables: { tag_groups: groups, tags: tagRows } });
    const props = await load(TagsPage());
    expect(props).toEqual({
      groups: [{ id: "g1", name: "ジャンル" }],
      tags: [{ id: T1, name: "十八番", groupId: "g1", count: 3, aliases: ["a", "b"] }],
    });
    setup({ tables: { tags: { data: [{ id: T1, name: "x", group_id: null }] } } });
    expect((await load(TagsPage())).tags).toEqual([
      { id: T1, name: "x", groupId: null, count: 0, aliases: [] },
    ]);
  });
});

describe("LoginPage", () => {
  const form = async (sp: Record<string, string>) => {
    const page = LoginPage({ searchParams: params(sp) });
    const suspense = (page.props as { children: ReactElement[] }).children[1];
    const loader = (suspense.props as { children: ReactElement }).children;
    const el = await (loader.type as (p: unknown) => Promise<ReactElement>)(loader.props);
    return renderToStaticMarkup(el);
  };

  it("招待制の案内と規約へのリンクを出す", () => {
    const html = renderToStaticMarkup(LoginPage({ searchParams: params({}) }));
    expect(html).toContain("招待制");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("戻り先を hidden で持ち、エラーや削除完了を出す", async () => {
    let html = await form({ next: "/tags" });
    expect(html).toContain('name="next" value="/tags"');
    expect(html).not.toContain('role="alert"');
    html = await form({ error: "denied", deleted: "1" });
    expect(html).toContain("招待制です");
    expect(html).toContain("すべてのデータを削除しました");
    html = await form({ error: "unknown" });
    expect(html).toContain("ログインできませんでした");
    expect(html).toContain('name="next" value="/"');
  });
});

describe("静的なページ・レイアウト", () => {
  it("ルートレイアウトは日本語でフォントの変数を付ける", () => {
    const html = renderToStaticMarkup(RootLayout({ children: <p>中身</p> }));
    expect(html).toContain('<html lang="ja" class="font-zen font-klee">');
    expect(html).toContain("<p>中身</p>");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(viewport.viewportFit).toBe("cover");
  });

  it("アプリのレイアウトはサイドバーと中身を並べる", () => {
    const html = renderToStaticMarkup(AppLayout({ children: <p>中身</p> }));
    expect(html).toContain("メインメニュー");
    expect(html).toContain("<p>中身</p>");
  });

  it("規約・プライバシーは草案の注記付きで出す", () => {
    for (const Page of [TermsPage, PrivacyPage]) {
      const html = renderToStaticMarkup(LegalLayout({ children: Page() }));
      expect(html).toContain("草案");
      expect(html).toContain("<h1>");
    }
  });

  it("ヘルプは目次と各節を持ち、困りごとから節へリンクする", () => {
    const html = renderToStaticMarkup(HelpPage());
    expect(html).toContain("<h1>使い方・ヘルプ</h1>");
    for (const id of ["trouble", "services", "random", "home-screen", "account", "contact"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('href="/help#services"');
    expect(html).toContain('href="/welcome"');
    expect(html).toContain("YouTube Music");
  });

  it("ヘルプに「練習の優先度」の節があり、「練習する」チップと「なし」に戻すことに触れている", () => {
    const html = renderToStaticMarkup(HelpPage());
    expect(html).toContain('id="practice"');
    expect(html).toContain("練習の優先度");
    expect(html).toContain("練習する");
    expect(html).toContain("「なし」");
  });

  it("404 はセトリへのリンク", () => {
    expect(renderToStaticMarkup(NotFound())).toContain('href="/"');
  });

  it("manifest のアイコンに maskable 版を含める", () => {
    const m = manifest();
    expect(m.start_url).toBe("/");
    expect(m.icons?.filter((i) => i.purpose === "maskable")).toHaveLength(2);
  });
});
