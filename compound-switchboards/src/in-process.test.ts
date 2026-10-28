import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCompound } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectionAnswer, projectRoot } from "./stack.js";

// What a spawned child cannot show: the config each member's server was
// started with, and process.env after both started. The compound runs in this
// process; startSwitchboard is wrapped to record its config, as powerhouse's
// own compound-switchboards test does. vitest.config.ts inlines host-core and
// ph-cli's switchboard runner so the mock reaches the runner's import.

/** The parts of a member's merged switchboard config this test reads. */
interface MemberConfig {
  storage: {
    reactor?: { url?: string };
    readModel?: { url?: string };
    userDataDir?: string;
  };
  protocol?: Record<string, unknown>;
  auth?: {
    admins?: string[];
    wsRecheckMs?: number;
    documentPermissions?: { cacheTtlMs?: number };
  };
  inspection?: { enabled?: boolean; callsPerMinute?: number };
}

interface Started {
  config: MemberConfig;
  port: number;
}

type StartSwitchboard = (
  config: MemberConfig,
  deps?: Record<string, unknown>,
) => Promise<{ port: number }>;

// @powerhousedao/switchboard is ph-cli's dependency, not this recipe's. The
// mock names the file ph-cli's runner imports: the "./server" export of the
// switchboard that Node finds from ph-cli's own folder.
const { serverModule, state } = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const { existsSync, readFileSync, realpathSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const phCli = createRequire(import.meta.url).resolve(
    "@powerhousedao/ph-cli/package.json",
  );
  const switchboard = createRequire(phCli)
    .resolve.paths("@powerhousedao/switchboard")
    ?.map((dir) => join(dir, "@powerhousedao/switchboard/package.json"))
    .find((file) => existsSync(file));
  if (!switchboard) throw new Error(`no @powerhousedao/switchboard next to ${phCli}`);
  const { exports } = JSON.parse(readFileSync(switchboard, "utf8")) as {
    exports: Record<string, { import: string }>;
  };
  return {
    serverModule: realpathSync(join(dirname(switchboard), exports["./server"].import)),
    state: { started: [] as Started[] },
  };
});

vi.mock(serverModule, async (importOriginal) => {
  const actual = await importOriginal<{ startSwitchboard: StartSwitchboard }>();
  const startSwitchboard: StartSwitchboard = async (config, deps = {}) => {
    // ph-cli asks for fatalErrorShutdown, which exits the process.
    const handle = await actual.startSwitchboard(config, {
      ...deps,
      fatalErrorShutdown: false,
    });
    state.started.push({ config, port: handle.port });
    return handle;
  };
  return { ...actual, startSwitchboard };
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
        // userDataDir: the env's, for both.
        expect(a.config.storage.userDataDir).toBe(userData);
        expect(b.config.storage.userDataDir).toBe(userData);

        // Protocol: each member's own block and nothing else. b sets no
        // createSignaturePolicy and does not get a's "legacy" (in 6.2.3-dev.78
        // it did, through process.env).
        expect(a.config.protocol).toEqual({
          featureFlags: { documentDecisions: true },
          createSignaturePolicy: "legacy",
        });
        expect(b.config.protocol).toEqual({
          featureFlags: { documentDecisions: false },
          unsupportedStoredDocuments: "read-only",
        });

        // config.switchboard: auth and inspection differ per member.
        expect(a.config.auth).toEqual({ admins: ["0xa"], wsRecheckMs: 1000 });
        expect(b.config.auth).toEqual({ documentPermissions: { cacheTtlMs: 500 } });
        expect(a.config.inspection).toEqual({ enabled: false });
        expect(b.config.inspection).toEqual({ enabled: true, callsPerMinute: 7 });
        expect(await inspectionAnswer(`http://localhost:${a.port}`)).toEqual({
          status: 404,
        });
        expect(await inspectionAnswer(`http://localhost:${b.port}`)).toEqual({
          status: 200,
          typename: "Query",
        });
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
