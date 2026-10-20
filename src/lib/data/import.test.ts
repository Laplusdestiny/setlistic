import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS, parseImport } from "./import";

const base = { app: "setlistic", version: 1 };
const ok = (raw: unknown) => {
  const r = parseImport(raw);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("parseImport: 形式チェック", () => {
  it("Setlistic 以外・バージョン違い・オブジェクトでないものは拒否", () => {
    expect(parseImport(null).ok).toBe(false);
    expect(parseImport([]).ok).toBe(false);
    expect(parseImport({ app: "other", version: 1 }).ok).toBe(false);
    expect(parseImport({ app: "setlistic", version: 2 }).ok).toBe(false);
  });
  it("空のエクスポートは通る", () => {
    const r = ok(base);
    expect(r.payload).toMatchObject({ tag_groups: [], tags: [], custom_fields: [], songs: [] });
    expect(r.warnings).toEqual([]);
  });
  it("件数の上限を超えると拒否", () => {
    const songs = Array.from({ length: IMPORT_LIMITS.songs + 1 }, () => ({}));
    expect(parseImport({ ...base, songs }).ok).toBe(false);
  });
});

describe("parseImport: 曲", () => {
  const song = {
    apple_track_id: 123,
    title: " 夜に駆ける ",
    artist: "YOASOBI",
    album: "THE BOOK",
    artwork_url: "https://example.com/a.jpg",
    apple_url: "javascript:alert(1)",
    song_key: -2,
    memo: " m ",
    created_at: "2026-02-01T00:00:00Z",
    tags: ["十八番", "", "盛り上げ"],
    fields: { 最高点: 92, 機種: "DAM", 配列: ["a", 1], 変: { x: 1 } },
    sing_logs: [
      { sung_at: "2026-03-01", ease: 2, note: "ok" },
      { sung_at: "2026-02-30" },
      { sung_at: "2026-03-02", ease: 9 },
    ],
  };

  it("整形して通す（trim、https以外のURLは捨てる、日時はISO、項目値は型を絞る）", () => {
    const r = ok({ ...base, songs: [song] });
    expect(r.payload.songs[0]).toMatchObject({
      apple_track_id: 123,
      title: "夜に駆ける",
      apple_url: null,
      artwork_url: "https://example.com/a.jpg",
      song_key: -2,
      memo: "m",
      created_at: "2026-02-01T00:00:00.000Z",
      source_service: "apple_music",
      tags: ["十八番", "盛り上げ"],
      fields: { 最高点: 92, 機種: "DAM", 配列: ["a"] },
    });
  });
  it("歌唱記録は日付が不正なものを除き、歌いやすさが範囲外なら null にする", () => {
    const r = ok({ ...base, songs: [song] });
    expect(r.payload.songs[0].sing_logs).toEqual([
      { sung_at: "2026-03-01", ease: 2, note: "ok" },
      { sung_at: "2026-03-02", ease: null, note: null },
    ]);
  });
  it("曲名・アーティストが無い曲は取り除き、警告を返す", () => {
    const r = ok({ ...base, songs: [song, { title: "x" }, { artist: "y" }, "str", null] });
    expect(r.payload.songs).toHaveLength(1);
    expect(r.warnings).toEqual(["曲4件は形式が正しくないため取り込みません"]);
  });
  it("キー範囲外・不正なトラックIDは null、手入力は manual", () => {
    const r = ok({
      ...base,
      songs: [{ title: "a", artist: "b", song_key: 99, apple_track_id: -1 }],
    });
    expect(r.payload.songs[0]).toMatchObject({
      song_key: null,
      apple_track_id: null,
      source_service: "manual",
    });
  });
  it('練習の優先度：1・2・3は通し、0・4・"高"・"1"・nullは null、キーが無くても null（エラーにならない）', () => {
    const r = ok({
      ...base,
      songs: [
        { title: "高優先度", artist: "a", practice_priority: 1 },
        { title: "中優先度", artist: "b", practice_priority: 2 },
        { title: "低優先度", artist: "c", practice_priority: 3 },
        { title: "無効値_0", artist: "d", practice_priority: 0 },
        { title: "無効値_4", artist: "e", practice_priority: 4 },
        { title: "無効値_文字列高", artist: "f", practice_priority: "高" },
        { title: "無効値_文字列1", artist: "g", practice_priority: "1" },
        { title: "無効値_null", artist: "h", practice_priority: null },
        { title: "無効値_キーなし", artist: "i" },
      ],
    });
    expect(r.payload.songs).toHaveLength(9);
    expect(r.payload.songs[0].practice_priority).toBe(1);
    expect(r.payload.songs[1].practice_priority).toBe(2);
    expect(r.payload.songs[2].practice_priority).toBe(3);
    expect(r.payload.songs[3].practice_priority).toBe(null);
    expect(r.payload.songs[4].practice_priority).toBe(null);
    expect(r.payload.songs[5].practice_priority).toBe(null);
    expect(r.payload.songs[6].practice_priority).toBe(null);
    expect(r.payload.songs[7].practice_priority).toBe(null);
    expect(r.payload.songs[8].practice_priority).toBe(null);
    expect(r.warnings).toEqual([]);
  });
});

describe("parseImport: タグ・グループ・項目・設定", () => {
  it("タグ（グループ・別名つき）とグループ", () => {
    const r = ok({
      ...base,
      tag_groups: [{ name: "歌える度", sort_order: 0 }, { name: "" }],
      tags: [
        { name: "十八番", group: "歌える度", sort_order: 1, aliases: ["おはこ", ""] },
        { name: " " },
      ],
    });
    expect(r.payload.tag_groups).toEqual([{ name: "歌える度", sort_order: 0 }]);
    expect(r.payload.tags).toEqual([
      { name: "十八番", group: "歌える度", sort_order: 1, aliases: ["おはこ"] },
    ]);
    expect(r.warnings).toHaveLength(2);
  });
  it("カスタム項目：不正な種類・選択肢なしの選択型は取り除く", () => {
    const r = ok({
      ...base,
      custom_fields: [
        { name: "最高点", field_type: "number", show_in_list: true },
        { name: "機種", field_type: "select", options: ["DAM"] },
        { name: "空", field_type: "select", options: [] },
        { name: "変", field_type: "color" },
      ],
    });
    expect(r.payload.custom_fields.map((f) => [f.name, f.options, f.show_in_list])).toEqual([
      ["最高点", null, true],
      ["機種", ["DAM"], false],
    ]);
    expect(r.warnings).toEqual(["カスタム項目2件は形式が正しくないため取り込みません"]);
  });
  it("設定：許可された値だけ", () => {
    const r = ok({
      ...base,
      settings: { list_sort: "title_asc", list_columns: ["key", "evil"], default_tags: ["歌える"] },
    });
    expect(r.payload.settings).toEqual({
      list_sort: "title_asc",
      list_columns: ["key"],
      default_tags: ["歌える"],
    });
    expect(ok({ ...base, settings: { list_sort: "drop table" } }).payload.settings).toEqual({});
  });
});
