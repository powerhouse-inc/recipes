import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  spawnHost,
  SpawnHostError,
  type SpawnedHost,
} from "@powerhousedao/host-core";
import { describe, expect, it } from "vitest";
import {
  driveAnswers,
  inspectionAnswers,
  projectRoot,
  READY_TIMEOUT_MS,
  withStack,
} from "./stack.js";

// spawnHost's own timeouts fire before vitest's, so a failing run still stops
// the child.
const TEST_TIMEOUT_MS = 240_000;

describe("ph run stack through spawnHost", () => {
  it(
    "starts both members on their own port, drive, stores and inspection setting",
    async () => {
      let spawned: SpawnedHost | undefined;
      await withStack({}, async (host, { a, b }) => {
        spawned = host;
        expect(host.record.kind).toBe("compound");
        expect(host.outputs).toBeUndefined();
        expect(Object.keys(host.members ?? {}).sort()).toEqual(["a", "b"]);
        expect(host.members?.a.host).toBe("sb-a");
        expect(host.members?.b.host).toBe("sb-b");

        // Ports: both asked for 0; each reports the one it bound.
        expect(a.origin).toMatch(/^http:\/\/localhost:[1-9]\d*$/);
        expect(b.origin).toMatch(/^http:\/\/localhost:[1-9]\d*$/);
        expect(a.origin).not.toBe(b.origin);

        // Documents: each reactor holds only its own drive.
        expect(Object.keys(a.drives)).toEqual(["alpha"]);
        expect(Object.keys(b.drives)).toEqual(["beta"]);
        expect(await driveAnswers(a.origin, "alpha")).toBe(true);
        expect(await driveAnswers(a.origin, "beta")).toBe(false);
        expect(await driveAnswers(b.origin, "beta")).toBe(true);
        expect(await driveAnswers(b.origin, "alpha")).toBe(false);

        // config.switchboard: inspection off on a, on for b.
        expect(await inspectionAnswers(a.origin)).toBe(false);
        expect(await inspectionAnswers(b.origin)).toBe(true);

        // Stores: each member's reactor and read model under its own folder
        // of the spawn's dataDir.
        const ph = join(host.dataDir, ".ph");
        for (const member of ["sb-a", "sb-b"]) {
          expect(existsSync(join(ph, member, "reactor"))).toBe(true);
          expect(existsSync(join(ph, member, "read-model"))).toBe(true);
        }

        // Identity: one PH_USER_DATA_DIR for both, so a keeps the default
        // keypair under it; b names its own in config.switchboard.identity.
        const keypairA = readFileSync(join(ph, ".keypair.json"), "utf8");
        const keypairB = readFileSync(join(ph, "sb-b", ".keypair.json"), "utf8");
        expect(keypairA).not.toBe(keypairB);
      });

      const host = spawned!;
      // The compound's signal handler exits 143 after a clean SIGTERM
      // teardown; `forced` stays false.
      await expect(host.exited).resolves.toEqual({
        code: 143,
        signal: null,
        forced: false,
      });
      expect(existsSync(host.dataDir)).toBe(false);
      expect(existsSync(join(projectRoot, ".ph"))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "applies the operator's env over both members; only literal true or false counts",
    async () => {
      // Two compounds at once: INSPECTION_ENABLED=false turns off b's
      // inspection too; "1" is not a value the flag reads, so b keeps its own.
      const [off, notAFlag] = await Promise.all([
        withStack({ INSPECTION_ENABLED: "false" }, async (_host, { a, b }) => [
          await inspectionAnswers(a.origin),
          await inspectionAnswers(b.origin),
        ]),
        withStack({ INSPECTION_ENABLED: "1" }, async (_host, { a, b }) => [
          await inspectionAnswers(a.origin),
          await inspectionAnswers(b.origin),
        ]),
      ]);
      expect(off).toEqual([false, false]);
      expect(notAFlag).toEqual([false, true]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fails the start when the env contradicts a member's reactor.protocol",
    async () => {
      // sb-a sets createSignaturePolicy "legacy". sb-b sets none, so the env
      // value would be fine for b alone; the compound fails as a whole.
      const dataDir = await mkdtemp(join(tmpdir(), "ph-stack-"));
      try {
        const error = await spawnHost({
          projectRoot,
          host: "stack",
          dataDir,
          env: { CREATE_SIGNATURE_POLICY: "v2-required" },
          readyTimeoutMs: READY_TIMEOUT_MS,
        }).then(
          async (host) => {
            await host.stop();
            throw new Error("expected the start to fail");
          },
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(SpawnHostError);
        const failed = error as SpawnHostError;
        expect(failed.phase).toBe("exited");
        expect(failed.exit?.code).toBe(1);
        expect(failed.outputTail).toContain(
          'reactor.protocol conflict: CREATE_SIGNATURE_POLICY is "v2-required" in the environment but "legacy" in hosts/sb-a/host.js',
        );
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT_MS,
  );
});
