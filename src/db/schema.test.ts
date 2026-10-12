import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

const tables: PgTable[] = Object.values<unknown>(schema).filter((v) => is(v, PgTable)) as PgTable[];

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
});
