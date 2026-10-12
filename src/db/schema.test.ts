import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

// 許可リストはユーザーデータではない（ポリシーなし＝APIから一切読めない）
const NON_USER_TABLES = ["allowed_emails"];
const allTables = Object.values<unknown>(schema).filter((v) => is(v, PgTable)) as PgTable[];
const tables = allTables.filter((t) => !NON_USER_TABLES.includes(getTableConfig(t).name));

describe("DBスキーマ", () => {
  it("テーブルが定義されている", () => {
    expect(tables.length).toBeGreaterThanOrEqual(10);
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    "%s はRLS有効でポリシーを持ち、user_id を持つ",
    (_name, table) => {
      const cfg = getTableConfig(table);
      expect(cfg.enableRLS).toBe(true);
      expect(cfg.policies.length).toBeGreaterThan(0);
      expect(cfg.columns.some((c) => c.name === "user_id")).toBe(true);
    },
  );

  it("許可リストはRLS有効でポリシーを持たない（APIから読めない）", () => {
    const cfg = getTableConfig(schema.allowedEmails);
    expect(cfg.enableRLS).toBe(true);
    expect(cfg.policies).toHaveLength(0);
  });
});
