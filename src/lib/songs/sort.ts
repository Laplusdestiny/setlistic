export const SORT_KEYS = [
  "created_desc",
  "created_asc",
  "last_sung_asc",
  "sung_count_desc",
  "title_asc",
  "artist_asc",
  "priority_asc",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "created_desc";

export const SORT_LABELS: Record<SortKey, string> = {
  created_desc: "最近追加順",
  created_asc: "追加が古い順",
  last_sung_asc: "最近歌っていない順",
  sung_count_desc: "歌った回数が多い順",
  title_asc: "曲名順",
  artist_asc: "アーティスト名順",
  priority_asc: "練習の優先度が高い順",
};

export function parseSort(value: unknown, fallback: SortKey = DEFAULT_SORT): SortKey {
  return SORT_KEYS.find((k) => k === value) ?? fallback;
}

export type OrderSpec = { column: string; ascending: boolean; nullsFirst?: boolean };

/** PostgREST の order に渡す指定。最後に created_at desc を足して順序を安定させる */
export function orderSpecs(sort: SortKey): OrderSpec[] {
  const tail: OrderSpec = { column: "created_at", ascending: false };
  switch (sort) {
    case "created_desc":
      return [tail];
    case "created_asc":
      return [{ column: "created_at", ascending: true }];
    case "last_sung_asc":
      // まだ歌っていない曲を先頭、そのあと歌った日が古い順
      return [{ column: "last_sung_at", ascending: true, nullsFirst: true }, tail];
    case "sung_count_desc":
      return [{ column: "sung_count", ascending: false }, tail];
    case "title_asc":
      return [{ column: "title", ascending: true }, tail];
    case "artist_asc":
      return [{ column: "artist", ascending: true }, { column: "title", ascending: true }, tail];
    case "priority_asc":
      // 優先度が高い（数値が小さい）順。未設定は最後
      return [{ column: "practice_priority", ascending: true, nullsFirst: false }, tail];
  }
}
