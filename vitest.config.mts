import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // 画面のテストはファイル先頭の `// @vitest-environment jsdom` で DOM 環境に切り替える
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      // テストの有無にかかわらず src の全ファイルを対象にする（未テストの画面も数字に出す）
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/test/**"],
      // Codecov へは lcov を送る。text はログ用、json-summary は手元の確認用
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
