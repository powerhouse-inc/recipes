import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Typed locally because spawnHost ships after the catalog's host-core pin
// (powerhouse PR #3286); see the README's Requirements.
export interface SpawnedHost {
  pid: number;
  dataDir: string;
  outputs: Record<string, unknown> | undefined;
  stop(): Promise<{ code: number | null; signal: string | null; forced: boolean }>;
}

export interface SpawnHostOptions {
  projectRoot: string;
  host: string;
  dataDir: string;
  env?: Record<string, string>;
  readyTimeoutMs?: number;
  onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
}

export type SpawnHost = (options: SpawnHostOptions) => Promise<SpawnedHost>;

/** `spawnHost` from host-core, or undefined when the installed version predates it. */
export async function loadSpawnHost(): Promise<SpawnHost | undefined> {
  const core = (await import("@powerhousedao/host-core")) as {
    spawnHost?: SpawnHost;
  };
  return core.spawnHost;
}

/**
 * Runs `ph run <host>` in a throwaway data dir, hands the host's outputs to
 * `use`, and always stops the host and removes the dir afterwards.
 */
export async function withHost<T>(
  spawnHost: SpawnHost,
  options: Omit<SpawnHostOptions, "dataDir">,
  use: (host: SpawnedHost) => Promise<T>,
): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), "ph-spawn-"));
  const host = await spawnHost({ ...options, dataDir });
  try {
    return await use(host);
  } finally {
    await host.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
}
