import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 120_000,
    // The tests share one dist/ and one index.ts, so files and tests run in order.
    fileParallelism: false,
  },
});
