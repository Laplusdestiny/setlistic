import { normalizeTagName } from "./normalize";

// 歌唱記録を残したあと、「練習中」「歌いたい」を「歌える」に付け替えるかを聞く（Issue #65）。
// どれもアカウント作成時に「歌える度」グループに作る初期タグ。名前で見分けるので、名前を変えたタグは対象外

const PRACTICE_NAMES = ["練習中", "歌いたい"].map(normalizeTagName);
export const SINGABLE_TAG = "歌える";
export const SINGABLE_GROUP = "歌える度";

type Tag = { id: string; name: string };

export type SingablePlan = {
  /** 外すタグ（曲に付いている「練習中」「歌いたい」） */
  remove: Tag[];
  /** 付ける「歌える」。消されていたら「歌える度」グループに作り直す */
  add: { tagId: string } | { newTag: { name: string; group: string } };
};

/** 曲のタグから付け替えの案を作る。「練習中」も「歌いたい」も付いていなければ null */
export function planSingable(songTags: Tag[], allTags: Tag[]): SingablePlan | null {
  const remove = songTags.filter((t) => PRACTICE_NAMES.includes(normalizeTagName(t.name)));
  if (remove.length === 0) return null;
  const singable = allTags.find((t) => normalizeTagName(t.name) === SINGABLE_TAG);
  return {
    remove,
    add: singable
      ? { tagId: singable.id }
      : { newTag: { name: SINGABLE_TAG, group: SINGABLE_GROUP } },
  };
}
