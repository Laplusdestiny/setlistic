export type TagOption = {
  id: string;
  name: string;
  groupId: string | null;
  /** 検索・候補表示で名前と同じように使う言い換え */
  aliases?: string[];
};
export type GroupOption = { id: string; name: string };
export type NewTag = { name: string; group?: string };
