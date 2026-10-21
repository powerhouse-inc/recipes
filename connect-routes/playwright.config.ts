import { defineConfig, devices } from "@playwright/test";

const PORT = 4199;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  // The tests share one dev server.
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry: with every test failing, two would take the run past the
  // recipes CI job's 600s per script.
  retries: process.env.CI ? 1 : 0,
  // The recipes CI job prints the end of the output, so no HTML report.
  reporter: "list",
  // The first load waits on Vite's dependency optimizer and the browser reactor.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Answers the cookie banner, which otherwise covers the page.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [
            { name: "/:display-cookie-banner", value: "false" },
            {
              name: "/:acceptedCookies",
              value: '{"analytics":true,"marketing":false,"functional":false}',
            },
          ],
        },
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Studio is Connect's dev server: it builds the route tree from
  // hosts/connect/routes/ on start, so the tests need no build first.
  webServer: {
    command: `pnpm exec ph-cli connect studio --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
