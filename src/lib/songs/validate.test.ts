import { describe, expect, it } from "vitest";
import { sanitizeDraft, toRegisterPayload, toUpdatePayload } from "./validate";

const draft = {
  appleTrackId: 1,
  title: " 夜に駆ける ",
  artist: "YOASOBI",
  album: null,
  genre: "J-Pop",
  artworkUrl: "https://is1-ssl.mzstatic.com/x.jpg",
  durationMs: 1000,
  releaseDate: "2019-12-15",
  appleUrl: "https://music.apple.com/jp/song/1",
  sourceService: "apple_music",
  sourceUrl: "https://music.apple.com/jp/song/1",
};
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("sanitizeDraft", () => {
  it("前後の空白を除き、そのまま通す", () => {
    const r = sanitizeDraft(draft);
    expect(r.ok && r.value.title).toBe("夜に駆ける");
  });
  it("曲名・アーティストが空ならエラー", () => {
    expect(sanitizeDraft({ ...draft, title: "  " })).toMatchObject({ ok: false });
    expect(sanitizeDraft({ ...draft, artist: "" })).toMatchObject({ ok: false });
    expect(sanitizeDraft(null)).toMatchObject({ ok: false });
  });
  it("https 以外のURLは捨てる", () => {
    const r = sanitizeDraft({
      ...draft,
      appleUrl: "javascript:alert(1)",
      sourceUrl: "http://x",
      artworkUrl: "data:x",
    });
    expect(r.ok && [r.value.appleUrl, r.value.sourceUrl, r.value.artworkUrl]).toEqual([
      null,
      null,
      null,
    ]);
  });
  it("不正な値は null / manual に落とす", () => {
    const r = sanitizeDraft({
      ...draft,
      appleTrackId: -5,
      durationMs: 1.5,
      releaseDate: "yesterday",
      sourceService: "evil",
    });
    expect(r.ok && r.value).toMatchObject({
      appleTrackId: null,
      durationMs: null,
      releaseDate: null,
      sourceService: "manual",
    });
  });
  it("長すぎる曲名は切り詰める", () => {
    const r = sanitizeDraft({ ...draft, title: "あ".repeat(500) });
    expect(r.ok && [...r.value.title].length).toBe(200);
  });
});

describe("toRegisterPayload", () => {
  const base = { draft, songKey: null, memo: "", tagIds: [], newTags: [] };

  it("DB関数に渡す形（snake_case）に変換する", () => {
    const r = toRegisterPayload({ ...base, songKey: -2, memo: " サビ前で息継ぎ " });
    expect(r.ok && r.value.song).toMatchObject({
      apple_track_id: 1,
      title: "夜に駆ける",
      song_key: -2,
      memo: "サビ前で息継ぎ",
    });
  });
  it("キーは -7〜+7 に収め、無効値は null", () => {
    expect(toRegisterPayload({ ...base, songKey: 99 })).toMatchObject({
      value: { song: { song_key: 7 } },
    });
    expect(toRegisterPayload({ ...base, songKey: "x" })).toMatchObject({
      value: { song: { song_key: null } },
    });
  });
  it("UUIDでないタグIDは捨て、重複は1つにする", () => {
    const r = toRegisterPayload({ ...base, tagIds: [UUID, UUID, "not-uuid", 5] });
    expect(r.ok && r.value.tagIds).toEqual([UUID]);
  });
  it("新規タグは # を外して正規化・重複排除し、許可グループだけ通す", () => {
    const r = toRegisterPayload({
      ...base,
      newTags: [
        { name: "#J-Pop", group: "ジャンル" },
        { name: "j-pop" },
        { name: "盛り上げ", group: "歌える度" },
        { name: "" },
      ],
    });
    expect(r.ok && r.value.newTags).toEqual([
      { name: "J-Pop", normalized: "j-pop", group: "ジャンル" },
      { name: "盛り上げ", normalized: "盛り上げ", group: undefined },
    ]);
  });
  it("長すぎるタグは捨てる／タグ数が多すぎるとエラー", () => {
    const long = toRegisterPayload({ ...base, newTags: [{ name: "あ".repeat(40) }] });
    expect(long.ok && long.value.newTags).toEqual([]);
    const many = toRegisterPayload({
      ...base,
      newTags: Array.from({ length: 31 }, (_, i) => ({ name: `t${i}` })),
    });
    expect(many.ok).toBe(false);
  });
  it("曲情報が不正ならエラー", () => {
    expect(toRegisterPayload({ ...base, draft: { ...draft, title: "" } }).ok).toBe(false);
    expect(toRegisterPayload(undefined).ok).toBe(false);
  });
});

describe("toUpdatePayload", () => {
  const base = {
    id: UUID,
    title: " 新曲名 ",
    artist: "新",
    songKey: -1,
    memo: " m ",
    tagIds: [],
    newTags: [],
  };

  it("編集できる項目だけをDB関数の形にする", () => {
    const r = toUpdatePayload({ ...base, appleTrackId: 5, sungCount: 99, userId: "x" });
    expect(r).toEqual({
      ok: true,
      value: {
        id: UUID,
        song: { title: "新曲名", artist: "新", song_key: -1, memo: "m", practice_priority: null },
        tagIds: [],
        newTags: [],
      },
    });
  });
  it("練習の優先度は 1〜3 だけ通し、それ以外・未送信は null", () => {
    const pri = (v: object) => {
      const r = toUpdatePayload({ ...base, ...v });
      return r.ok ? r.value.song.practice_priority : "error";
    };
    expect(pri({ practicePriority: 2 })).toBe(2);
    expect(pri({ practicePriority: null })).toBeNull();
    expect(pri({ practicePriority: 9 })).toBeNull();
    expect(pri({})).toBeNull();
  });
  it("曲IDがUUIDでない・曲名/アーティストが空はエラー", () => {
    expect(toUpdatePayload({ ...base, id: "1; drop" }).ok).toBe(false);
    expect(toUpdatePayload({ ...base, title: " " }).ok).toBe(false);
    expect(toUpdatePayload({ ...base, artist: "" }).ok).toBe(false);
    expect(toUpdatePayload(null).ok).toBe(false);
  });
  it("キーは範囲内に収め、メモが空なら null", () => {
    const r = toUpdatePayload({ ...base, songKey: 50, memo: "  " });
    expect(r.ok && r.value.song).toMatchObject({ song_key: 7, memo: null });
  });
  it("タグは登録と同じ規則で整える", () => {
    const r = toUpdatePayload({
      ...base,
      tagIds: [UUID, "bad"],
      newTags: [{ name: "#Rock" }, { name: "rock" }],
    });
    expect(r.ok && [r.value.tagIds, r.value.newTags]).toEqual([
      [UUID],
      [{ name: "Rock", normalized: "rock", group: undefined }],
    ]);
  });
});
