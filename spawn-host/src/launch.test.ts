import { existsSync } from "node:fs";
import type { HostExit, RunRecord } from "@powerhousedao/host-core";
import { describe, expect, it, vi } from "vitest";
import { withHost, type SpawnHost } from "./launch.js";

function fakeSpawnHost() {
  const exit: HostExit = { code: 0, signal: null, forced: false };
  const stop = vi.fn(async () => exit);
  const spawnHost: SpawnHost = vi.fn(async ({ host, dataDir }) => {
    const record: RunRecord = {
      version: 2,
      host,
      projectName: "fake",
      kind: "reactor",
      verb: "run",
      pid: 1,
      startedAt: new Date(0).toISOString(),
      outputs: { origin: "http://127.0.0.1:1" },
    };
    return {
      pid: record.pid,
      dataDir,
      record,
      outputs: record.outputs,
      members: record.members,
      exited: Promise.resolve(exit),
      stop,
    };
  });
  return { spawnHost, stop };
}

describe("withHost with a fake spawnHost", () => {
  it("gives the callback a ready host and cleans up after it", async () => {
    const { spawnHost, stop } = fakeSpawnHost();
    let dataDir = "";
    const origin = await withHost(
      spawnHost,
      { projectRoot: ".", host: "sb" },
      async (host) => {
        dataDir = host.dataDir;
        expect(existsSync(dataDir)).toBe(true);
        return host.outputs?.origin;
      },
    );
    expect(origin).toBe("http://127.0.0.1:1");
    expect(stop).toHaveBeenCalledOnce();
    expect(existsSync(dataDir)).toBe(false);
  });

  it("stops the host when the callback throws", async () => {
    const { spawnHost, stop } = fakeSpawnHost();
    await expect(
      withHost(spawnHost, { projectRoot: ".", host: "sb" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("removes the data dir when spawnHost rejects", async () => {
    let dataDir = "";
    const spawnHost: SpawnHost = async (options) => {
      dataDir = options.dataDir;
      throw new Error("not ready");
    };
    await expect(
      withHost(spawnHost, { projectRoot: ".", host: "sb" }, async () => 1),
    ).rejects.toThrow("not ready");
    expect(existsSync(dataDir)).toBe(false);
  });

  it("removes the data dir and keeps the callback's error when stop fails", async () => {
    const { spawnHost, stop } = fakeSpawnHost();
    stop.mockRejectedValueOnce(new Error("stop failed"));
    let dataDir = "";
    await expect(
      withHost(spawnHost, { projectRoot: ".", host: "sb" }, async (host) => {
        dataDir = host.dataDir;
      }),
    ).rejects.toThrow("stop failed");
    expect(existsSync(dataDir)).toBe(false);
  });
});
