import { describe, expect, it } from "vitest";
import { BULK_MAX_SONGS, toBulkTagPayload } from "./bulk-tags";

const S1 = "123e4567-e89b-42d3-a456-426614174001";
const S2 = "123e4567-e89b-42d3-a456-426614174002";
const T1 = "223e4567-e89b-42d3-a456-426614174001";
const T2 = "223e4567-e89b-42d3-a456-426614174002";

describe("toBulkTagPayload", () => {
  it("曲・付けるタグ・外すタグ・新規タグを整えて返す", () => {
    const r = toBulkTagPayload({
      songIds: [S1, S2, S1, "bad"],
      addTagIds: [T1, T1],
      newTags: [{ name: "#新しい" }, { name: "新しい" }],
      removeTagIds: [T2],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        songIds: [S1, S2],
        addTagIds: [T1],
        newTags: [{ name: "新しい", normalized: "新しい", group: undefined }],
        removeTagIds: [T2],
      },
    });
  });
  it("曲が1件もなければ拒否", () => {
    expect(toBulkTagPayload({ songIds: [], addTagIds: [T1] }).ok).toBe(false);
    expect(toBulkTagPayload({ songIds: ["x"], addTagIds: [T1] }).ok).toBe(false);
    expect(toBulkTagPayload(null).ok).toBe(false);
  });
  it("500曲を超えると拒否", () => {
    const many = Array.from(
      { length: BULK_MAX_SONGS + 1 },
      (_, i) => `123e4567-e89b-42d3-a456-${String(i).padStart(12, "0")}`,
    );
    expect(toBulkTagPayload({ songIds: many, addTagIds: [T1] }).ok).toBe(false);
    expect(toBulkTagPayload({ songIds: many.slice(0, BULK_MAX_SONGS), addTagIds: [T1] }).ok).toBe(
      true,
    );
  });
  it("付ける・外すのどちらも空なら拒否", () => {
    expect(toBulkTagPayload({ songIds: [S1] }).ok).toBe(false);
    expect(toBulkTagPayload({ songIds: [S1], newTags: [{ name: " " }] }).ok).toBe(false);
  });
  it("同じタグを付けて外すことはできない", () => {
    expect(toBulkTagPayload({ songIds: [S1], addTagIds: [T1], removeTagIds: [T1] }).ok).toBe(false);
  });
  it("新規タグだけ・外すだけでも通る", () => {
    expect(toBulkTagPayload({ songIds: [S1], newTags: [{ name: "x" }] }).ok).toBe(true);
    expect(toBulkTagPayload({ songIds: [S1], removeTagIds: [T1] }).ok).toBe(true);
  });
});
