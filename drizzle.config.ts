import { defineConfig } from "drizzle-kit";

// マイグレーション専用。ユーザー操作の処理ではこの接続を使わない（RLSを素通りするため）。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
