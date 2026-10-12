import { normalizeTagName } from "./normalize";

/** カラオケ機種のタグ。配信有無は公式APIがないため自動取得せず、ユーザーが曲に付ける（Issue #8） */
export const KARAOKE_GROUP_NAME = "カラオケ機種";
export const KARAOKE_TAG_NAMES = ["DAM", "JOYSOUND"] as const;

export type KaraokePlan = {
  groupName: string;
  /** 同名のグループがあればその id。null なら新しく作る */
  groupId: string | null;
  /** まだないタグだけ（正規化後の名前で比べる。別グループにあっても作らない） */
  names: string[];
};

export function planKaraokeTags(
  groups: { id: string; name: string }[],
  tags: { name: string }[],
): KaraokePlan {
  const existing = new Set(tags.map((t) => normalizeTagName(t.name)));
  return {
    groupName: KARAOKE_GROUP_NAME,
    groupId: groups.find((g) => g.name === KARAOKE_GROUP_NAME)?.id ?? null,
    names: KARAOKE_TAG_NAMES.filter((n) => !existing.has(normalizeTagName(n))),
  };
}
