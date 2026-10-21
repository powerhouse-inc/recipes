import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Builds the package with `ph-cli build` before any test reads dist/.
    globalSetup: ["./test/build.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 60_000,
  },
});
