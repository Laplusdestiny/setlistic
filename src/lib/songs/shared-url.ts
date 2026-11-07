// `/add?url=` で受け取った共有URLを、URL欄に入れる文字列にそろえる。
// Siri ショートカットは URL エンコードを挟む想定だが、挟み忘れ・二重エンコードにも耐える。

const MAX_LENGTH = 2000;

type Params = Record<string, string | string[] | undefined>;

/**
 * - 未エンコードの `&` で切れた分（`?url=https://…?v=1&si=2` の `si=2`）は、url の後ろに付け直す
 * - `https%3A%2F%2F…` のような二重エンコードは一度だけ戻す
 */
export function restoreSharedUrl(params: Params): string {
  const raw = params.url;
  const first = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  if (!first) return "";

  // url 以外のパラメータは、切れた残りとして元の順に付け直す
  const rest = Object.entries(params)
    .filter(([k]) => k !== "url")
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v ?? ""]).map((x) => (x ? k + "=" + x : k)));

  let value = first;
  if (/^https?%3A/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // 戻せないときはそのまま使う
    }
  }
  if (rest.length > 0) value += (value.includes("?") ? "&" : "?") + rest.join("&");
  return value.slice(0, MAX_LENGTH);
}
