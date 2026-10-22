import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test/e2e/ holds the Playwright specs, which `playwright test` runs.
    include: ["test/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
});
