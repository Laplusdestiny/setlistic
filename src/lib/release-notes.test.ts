import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import {
  RELEASES,
  compareVersions,
  currentVersion,
  groupReleaseChanges,
  parseVersion,
} from "./release-notes";

describe("RELEASES", () => {
  it("最新のバージョンが package.json の version とそろっている", () => {
    expect(currentVersion()).toBe(pkg.version);
  });

  it("バージョンは x.y.z の形で、重複なく新しい順に並んでいる", () => {
    for (const r of RELEASES) expect(parseVersion(r.version)).not.toBeNull();
    for (let i = 1; i < RELEASES.length; i++) {
      expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0);
    }
  });

  it("日付は YYYY-MM-DD で、新しい順（同じ日は可）に並んでいる", () => {
    for (const r of RELEASES) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });

  it("どのリリースにも変更が1件以上あり、本文が空でない", () => {
    for (const r of RELEASES) {
      expect(r.changes.length).toBeGreaterThan(0);
      for (const c of r.changes) expect(c.text.trim()).not.toBe("");
    }
  });
});

describe("groupReleaseChanges", () => {
  it("新機能 → 変更 → 修正の順にまとめ、空の種類は出さない", () => {
    const groups = groupReleaseChanges({
      version: "9.9.9",
      date: "2026-01-01",
      changes: [
        { kind: "fix", text: "直した" },
        { kind: "feature", text: "足した1" },
        { kind: "feature", text: "足した2" },
      ],
    });
    expect(groups).toEqual([
      { kind: "feature", label: "新機能", items: ["足した1", "足した2"] },
      { kind: "fix", label: "不具合の修正", items: ["直した"] },
    ]);
  });
});

describe("parseVersion / compareVersions", () => {
  it("x.y.z 以外は null", () => {
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("v1.2.3")).toBeNull();
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("各桁を数として比べる（0.10.0 は 0.9.0 より新しい）", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("形が違うとエラー", () => {
    expect(() => compareVersions("1.0", "1.0.0")).toThrow();
  });
});
