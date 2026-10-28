import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    globals: true,
    // in-process.test.ts mocks @powerhousedao/switchboard/server. The mock
    // only reaches modules vitest loads itself, so host-core (which imports
    // the runner) and ph-cli's switchboard runner chunks are inlined.
    server: {
      deps: {
        inline: [
          /@powerhousedao\/host-core\//,
          /@powerhousedao\/ph-cli\/dist\/(runners\/switchboard|switchboard-)/,
        ],
      },
    },
    // Each spawned or in-process test boots two switchboards; one file at a
    // time keeps their start-up inside the timeouts.
    fileParallelism: false,
  },
});
