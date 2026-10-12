import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

// 許可リストはユーザーデータではない（ポリシーなし＝APIから一切読めない）
const NON_USER_TABLES = ["allowed_emails", "app_admins"];
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

  it("許可リスト・管理者はRLS有効でポリシーを持たない（APIから読めない）", () => {
    for (const table of [schema.allowedEmails, schema.appAdmins]) {
      const cfg = getTableConfig(table);
      expect(cfg.enableRLS).toBe(true);
      expect(cfg.policies).toHaveLength(0);
    }
  });
});

// アカウント削除（auth.users の行を消す）で、そのユーザーの全データが消えること（CLAUDE.md の必須要件）
describe("外部キー：アカウント削除で全データが消える", () => {
  const fks = allTables.flatMap((t) =>
    getTableConfig(t).foreignKeys.map((fk) => {
      const ref = fk.reference();
      return {
        table: getTableConfig(t).name,
        columns: ref.columns.map((c) => c.name),
        foreignTable: getTableConfig(ref.foreignTable).name,
        onDelete: fk.onDelete,
      };
    }),
  );

  it.each(tables.map((t) => getTableConfig(t).name))(
    "%s.user_id は auth.users を参照し、cascade で消える",
    (name) => {
      expect(fks).toContainEqual({
        table: name,
        columns: ["user_id"],
        foreignTable: "users",
        onDelete: "cascade",
      });
    },
  );

  it("曲・タグなどへの参照は cascade（親を消すと紐づけも消える）", () => {
    const children = fks.filter((f) => f.foreignTable !== "users");
    expect(children.length).toBeGreaterThan(0);
    for (const f of children) {
      // タグのグループだけは、グループを消してもタグを残す（マイタグに移る）
      if (f.table === "tags" && f.columns[0] === "group_id") expect(f.onDelete).toBe("set null");
      else expect(f, `${f.table}.${f.columns}`).toMatchObject({ onDelete: "cascade" });
    }
  });
});
