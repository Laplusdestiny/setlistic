import { describe, expect, it } from "vitest";
import { EMPTY_CONDITIONS } from "./conditions";
import { suggestSearchName, toSavedSearch, toSavedSearchPayload } from "./saved";

const A = "123e4567-e89b-42d3-a456-426614174000";

describe("toSavedSearchPayload", () => {
  it("名前と正規化した条件を返す", () => {
    const r = toSavedSearchPayload({
      name: "  十八番  だけ ",
      conditions: { include: [A, "bad"], x: 1 },
    });
    expect(r).toEqual({
      ok: true,
      value: { name: "十八番 だけ", conditions: { ...EMPTY_CONDITIONS, include: [A] } },
    });
  });
  it("名前が空・長すぎるときは拒否", () => {
    expect(toSavedSearchPayload({ name: " ", conditions: { include: [A] } }).ok).toBe(false);
    expect(toSavedSearchPayload({ name: "あ".repeat(31), conditions: { include: [A] } }).ok).toBe(
      false,
    );
    expect(toSavedSearchPayload({ name: "あ".repeat(30), conditions: { include: [A] } }).ok).toBe(
      true,
    );
  });
  it("条件が空（並び順もなし）は拒否、並び順だけなら保存できる", () => {
    expect(toSavedSearchPayload({ name: "x", conditions: {} }).ok).toBe(false);
    expect(toSavedSearchPayload({ name: "x", conditions: { sort: "title_asc" } }).ok).toBe(true);
  });
  it("不正な入力は拒否", () => {
    expect(toSavedSearchPayload(null).ok).toBe(false);
    expect(toSavedSearchPayload({ name: 5, conditions: {} }).ok).toBe(false);
  });
});

describe("toSavedSearch", () => {
  it("壊れた conditions でも既定値にして返す", () => {
    expect(toSavedSearch({ id: "i", name: "n", conditions: "broken" })).toEqual({
      id: "i",
      name: "n",
      conditions: EMPTY_CONDITIONS,
    });
  });
});

describe("suggestSearchName", () => {
  it("条件の説明から作り、30文字に収める", () => {
    const c = { ...EMPTY_CONDITIONS, include: [A], q: "あ".repeat(40) };
    const name = suggestSearchName(c, () => "十八番");
    expect([...name].length).toBeLessThanOrEqual(30);
    expect(name.startsWith("キーワード")).toBe(true);
  });
});
