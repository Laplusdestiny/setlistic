// スマホでセトリから曲の画面を開いたとき、どの曲をどの一覧（検索・絞り込みの条件つきの URL）から
// 開いたかをタブごとに覚える。曲の画面の「戻る」と削除後の移動先に使う（Issue #51）

const KEY = "setlistic:song-return";

type Entry = { songId: string; href: string };

/** セトリの URL（`/` か `/?…`）だけを戻り先にする。ほかのパスや外部の URL は使わない */
export const isListHref = (href: string): boolean => href === "/" || href.startsWith("/?");

export function rememberSongReturn(songId: string, href: string): void {
  if (!isListHref(href)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ songId, href } satisfies Entry));
  } catch {
    // 使えない環境では覚えない（戻るはセトリに戻る）
  }
}

/** その曲をセトリから開いていれば、開いたときの一覧の URL。違えば null */
export function songReturnHref(songId: string): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Entry> | null;
    return v?.songId === songId && typeof v.href === "string" && isListHref(v.href) ? v.href : null;
  } catch {
    return null;
  }
}
