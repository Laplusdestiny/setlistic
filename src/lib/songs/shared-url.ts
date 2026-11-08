// 共有シート・ショートカット経由で `/add` に渡る値から、URL欄に入れる文字列を取り出す。
// - Android の Web Share Target は URL を `url` ではなく `text` に入れて渡すことが多い
// - ショートカットでエンコードし忘れると、`&` 以降（si=… など）が別のパラメーターに分かれる
// - 二重エンコード（`https%3A%2F%2F…`）は一度だけ戻す

const MAX_LENGTH = 2000;

export type SharedParams = Record<string, string | undefined>;

function decodeOnce(s: string): string {
  if (!/^https?%3A/i.test(s)) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const IS_URL = /^https?:\/\//i;

export function extractSharedUrl(params: SharedParams): string {
  let url = decodeOnce((params.url ?? "").trim());
  if (!IS_URL.test(url)) {
    // url が空・URLでない場合は、text → title の中から最初のURLを探す（無ければ url をそのまま使う）
    for (const candidate of [params.text, params.title]) {
      const m = decodeOnce((candidate ?? "").trim()).match(URL_IN_TEXT);
      if (m) {
        url = m[0];
        break;
      }
    }
  }
  if (!url) return "";
  if (!IS_URL.test(url)) return url.slice(0, MAX_LENGTH);

  // エンコードし忘れた `&` で切れたパラメーターを付け直す
  const rest = Object.entries(params)
    .filter(([k, v]) => !["url", "text", "title"].includes(k) && v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  if (rest.length > 0) {
    url += (url.includes("?") ? "&" : "?") + rest.join("&");
  }
  return url.slice(0, MAX_LENGTH);
}
