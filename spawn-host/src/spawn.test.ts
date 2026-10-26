import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnHost, type SpawnedHost } from "@powerhousedao/host-core";
import type { SwitchboardOutputs } from "@powerhousedao/ph-cli/runners/switchboard";
import { describe, expect, it } from "vitest";
import { withHost } from "./launch.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// spawnHost's own timeouts fire before vitest's, so a failing run still stops
// the child: ready within 60 s, stop within 30 s (SIGKILL after that).
const READY_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 120_000;

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("withHost with the real spawnHost", () => {
  it(
    "starts hosts/switchboard, serves its outputs, then stops and cleans up",
    async () => {
      let spawned: SpawnedHost | undefined;
      const typename = await withHost(
        spawnHost,
        { projectRoot, host: "switchboard", readyTimeoutMs: READY_TIMEOUT_MS },
        async (host) => {
          spawned = host;
          expect(isRunning(host.pid)).toBe(true);
          expect(host.record.host).toBe("switchboard");
          expect(host.record.pid).toBe(host.pid);
          expect(host.members).toBeUndefined();
          expect(
            existsSync(join(host.dataDir, ".ph", "run", "switchboard.json")),
          ).toBe(true);

          // The port comes from the outputs: the switchboard falls back to
          // the next free port when its default is taken.
          const { origin, endpoints, drives } =
            host.outputs as SwitchboardOutputs;
          expect(origin).toMatch(/^http:\/\/localhost:\d+$/);
          expect(endpoints.graphql).toBe(`${origin}/graphql`);
          expect(drives.recipes.url).toBe(`${origin}/d/recipes`);

          const drive = await fetch(drives.recipes.url, {
            signal: AbortSignal.timeout(10_000),
          });
          expect(drive.status).toBe(200);

          const response = await fetch(endpoints.graphql, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "{ __typename }" }),
            signal: AbortSignal.timeout(10_000),
          });
          const body = (await response.json()) as {
            data?: { __typename?: string };
          };
          return body.data?.__typename;
        },
      );

      expect(typename).toBe("Query");
      const host = spawned!;
      await expect(host.exited).resolves.toEqual({
        code: 0,
        signal: null,
        forced: false,
      });
      expect(isRunning(host.pid)).toBe(false);
      expect(existsSync(host.dataDir)).toBe(false);
      expect(existsSync(join(projectRoot, ".ph"))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
