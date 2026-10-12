import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // テストの有無にかかわらず src の全ファイルを対象にする（未テストの画面も数字に出す）
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      // Codecov へは lcov を送る。text はログ用、json-summary は手元の確認用
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
