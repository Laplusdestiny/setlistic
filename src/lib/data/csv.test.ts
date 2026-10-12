import { describe, expect, it } from "vitest";
import { csvCell, exportToCsv } from "./csv";

describe("csvCell", () => {
  it("カンマ・引用符・改行を含む値はクォートする", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("null/undefined は空", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("数式として解釈される先頭文字は ' を付けて無害化する", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
  it("数値列は無害化しない（負のキーを壊さない）", () => {
    expect(csvCell(-2, false)).toBe("-2");
  });
});

describe("exportToCsv", () => {
  const data = {
    custom_fields: [
      { name: "機種", sort_order: 2 },
      { name: "最高点", sort_order: 1 },
    ],
    songs: [
      {
        title: "夜に駆ける",
        artist: "YOASOBI",
        album: "THE BOOK",
        genre: "J-Pop",
        release_date: "2019-12-15",
        song_key: -2,
        memo: "サビ前で,息継ぎ",
        created_at: "2026-02-01T00:00:00Z",
        apple_url: "https://music.apple.com/jp/song/1",
        tags: ["十八番", "盛り上げ"],
        fields: { 最高点: 92, 機種: "DAM" },
        sing_logs: [{ sung_at: "2026-03-01" }, { sung_at: "2026-04-01", ease: 2 }],
      },
      { title: "=悪意ある曲名", artist: "x" },
    ],
  };

  it("BOM付き・CRLF・見出し行（項目は並び順）", () => {
    const csv = exportToCsv(data);
    expect(csv.startsWith("﻿曲名,アーティスト")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "曲名,アーティスト,アルバム,ジャンル,リリース日,キー,タグ,メモ,最後に歌った日,歌った回数,登録日,Apple Music URL,最高点,機種",
    );
    expect(lines.at(-1)).toBe(""); // 末尾の改行
  });
  it("曲の行：キー・回数・最後に歌った日・項目値", () => {
    const row = exportToCsv(data).slice(1).split("\r\n")[1];
    expect(row).toBe(
      '夜に駆ける,YOASOBI,THE BOOK,J-Pop,2019-12-15,-2,十八番 / 盛り上げ,"サビ前で,息継ぎ",2026-04-01,2,2026-02-01,https://music.apple.com/jp/song/1,92,DAM',
    );
  });
  it("曲名が数式っぽくても無害化され、欠けた項目は空欄", () => {
    const row = exportToCsv(data).slice(1).split("\r\n")[2];
    expect(row.startsWith("'=悪意ある曲名,x,")).toBe(true);
    expect(row.endsWith(",,")).toBe(true);
  });
  it("曲が0件でも見出しだけ出る", () => {
    const csv = exportToCsv({});
    expect(csv.slice(1).split("\r\n")).toHaveLength(2);
  });
});
