import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompound } from "@powerhousedao/host-core";
import {
  switchboardConfigSchema,
  type SwitchboardConfig,
  type SwitchboardConfigInput,
} from "@powerhousedao/switchboard/config";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectionAnswers, projectRoot } from "./stack.js";

// What a spawned child cannot show: the config each member's server was
// started with, and process.env after both started. The compound runs in this
// process; startSwitchboard is wrapped to record its config, as powerhouse's
// own compound-switchboards test does. vitest.config.ts inlines host-core and
// ph-cli's switchboard runner so the mock reaches the runner's import.

interface Started {
  config: SwitchboardConfig;
  port: number;
}

const state = vi.hoisted(() => ({ started: [] as Started[] }));

vi.mock("@powerhousedao/switchboard/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SwitchboardServer>();
  return {
    ...actual,
    startSwitchboard: async (
      config: SwitchboardConfigInput,
      deps: SwitchboardServer.SwitchboardDeps = {},
    ) => {
      // ph-cli asks for fatalErrorShutdown, which exits the process.
      const handle = await actual.startSwitchboard(config, {
        ...deps,
        fatalErrorShutdown: false,
      });
      state.started.push({
        config: switchboardConfigSchema.parse(config),
        port: handle.port,
      });
      return handle;
    },
  };
});

// hosts/stack/host.js, plus runtimeRecord: false so nothing is written to
// the project's .ph/run. spawnHost refuses that flag; runCompound takes it.
const stack = {
  name: "stack",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { a: { host: "sb-a" }, b: { host: "sb-b" } },
  config: { runtimeRecord: false },
};

async function isFree(port: number): Promise<boolean> {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

describe("the stack in this process", () => {
  let userData: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    if (userData) rmSync(userData, { recursive: true, force: true });
  });

  it(
    "starts each member on its own config and leaves process.env alone",
    async () => {
      // As under spawnHost: PH_USER_DATA_DIR is the root `${userData}`
      // resolves to, and no .env is read.
      userData = mkdtempSync(join(tmpdir(), "ph-stack-in-process-"));
      const env = { PH_USER_DATA_DIR: userData, PH_NO_DOTENV: "1" };
      const exit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("the compound must not exit the process");
      });
      const listenersBefore = process.listenerCount("SIGTERM");
      const envBefore = { ...process.env };

      state.started = [];
      const run = await runCompound(
        stack,
        { projectRoot, verb: "run", env },
        { projectName: "compound-switchboards", installSignalHandlers: false },
      );
      let ports: number[] = [];
      try {
        expect(process.env).toEqual(envBefore);
        expect(state.started).toHaveLength(2);
        const [a, b] = state.started;
        ports = [a.port, b.port];
        expect(a.port).not.toBe(b.port);
        expect(run.started.map((m) => m.outputs.origin)).toEqual([
          `http://localhost:${a.port}`,
          `http://localhost:${b.port}`,
        ]);

        // Stores: from each member's reactor block.
        const store = (member: string, name: string) =>
          join(userData!, ".ph", member, name);
        expect(a.config.storage).toMatchObject({
          reactor: { url: store("sb-a", "reactor") },
          readModel: { url: store("sb-a", "read-model") },
        });
        expect(b.config.storage).toMatchObject({
          reactor: { url: store("sb-b", "reactor") },
          readModel: { url: store("sb-b", "read-model") },
        });
        // userDataDir: the env's, for both. PH_USER_DATA_DIR is the last
        // layer, so a per-member storage.userDataDir would not hold here.
        expect(a.config.storage.userDataDir).toBe(userData);
        expect(b.config.storage.userDataDir).toBe(userData);

        // Protocol: each member's own block, defaults for what it leaves out.
        expect(a.config.protocol).toMatchObject({
          featureFlags: { documentDecisions: true },
          createSignaturePolicy: "legacy",
          unsupportedStoredDocuments: "refuse",
        });
        expect(b.config.protocol).toMatchObject({
          featureFlags: { documentDecisions: false },
          createSignaturePolicy: "v2-required",
          unsupportedStoredDocuments: "read-only",
        });

        // config.switchboard: auth and inspection differ per member.
        expect(a.config.auth).toMatchObject({
          admins: ["0xa"],
          wsRecheckMs: 1000,
        });
        expect(a.config.auth.documentPermissions.cacheTtlMs).toBeUndefined();
        expect(b.config.auth).toMatchObject({
          admins: [],
          documentPermissions: { cacheTtlMs: 500 },
        });
        expect(b.config.auth.wsRecheckMs).toBeUndefined();
        expect(a.config.inspection.enabled).toBe(false);
        expect(b.config.inspection).toMatchObject({
          enabled: true,
          callsPerMinute: 7,
        });
        expect(
          await inspectionAnswers(`http://localhost:${a.port}`),
        ).toBe(false);
        expect(
          await inspectionAnswers(`http://localhost:${b.port}`),
        ).toBe(true);
      } finally {
        await run.shutdown();
      }

      for (const port of ports) expect(await isFree(port)).toBe(true);
      expect(process.listenerCount("SIGTERM")).toBe(listenersBefore);
      expect(process.env).toEqual(envBefore);
      expect(existsSync(join(projectRoot, ".ph"))).toBe(false);
      expect(exit).not.toHaveBeenCalled();
    },
    240_000,
  );
});
