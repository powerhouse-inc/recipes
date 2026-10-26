import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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

          // The fixture asks for port 0, so the port exists only in the
          // outputs.
          const { origin, endpoints, drives } =
            host.outputs as SwitchboardOutputs;
          expect(origin).toMatch(/^http:\/\/localhost:[1-9]\d*$/);
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

  it(
    "gives two concurrent hosts their own ports",
    async () => {
      const opts = {
        projectRoot,
        host: "switchboard",
        readyTimeoutMs: READY_TIMEOUT_MS,
      };
      // Both start at once, so a shared-resource race at boot would show.
      const hosts = await Promise.all([
        spawnHost({ ...opts, dataDir: await mkdtemp(join(tmpdir(), "ph-a-")) }),
        spawnHost({ ...opts, dataDir: await mkdtemp(join(tmpdir(), "ph-b-")) }),
      ]);
      const origins = hosts.map(
        (h) => (h.outputs as SwitchboardOutputs).origin,
      );
      try {
        for (const origin of origins) {
          const health = await fetch(`${origin}/health`, {
            signal: AbortSignal.timeout(10_000),
          });
          expect(health.status).toBe(200);
        }
        expect(origins[0]).not.toBe(origins[1]);
      } finally {
        await Promise.all(hosts.map((h) => h.stop()));
        await Promise.all(
          hosts.map((h) => rm(h.dataDir, { recursive: true, force: true })),
        );
      }
    },
    TEST_TIMEOUT_MS,
  );
});
