import { describe, expect, it } from "vitest";
import { clampKey, formatKey } from "./key";

describe("key", () => {
  it("formatKey", () => {
    expect(formatKey(0)).toBe("±0");
    expect(formatKey(2)).toBe("+2");
    expect(formatKey(-2)).toBe("-2");
    expect(formatKey(null)).toBe("");
  });
  it("clampKey は -7〜+7 に収める", () => {
    expect(clampKey(8)).toBe(7);
    expect(clampKey(-9)).toBe(-7);
    expect(clampKey(3.7)).toBe(3);
  });
});
