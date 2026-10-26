import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SpawnedHost,
  SpawnHostOptions,
  spawnHost,
} from "@powerhousedao/host-core";

/** host-core's `spawnHost`, or a stand-in with the same shape. */
export type SpawnHost = typeof spawnHost;

/**
 * Runs `ph run <host>` in a throwaway data dir, hands the running host to
 * `use`, and always stops the host and removes the dir afterwards.
 */
export async function withHost<T>(
  spawnHost: SpawnHost,
  options: Omit<SpawnHostOptions, "dataDir">,
  use: (host: SpawnedHost) => Promise<T>,
): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), "ph-spawn-"));
  try {
    const host = await spawnHost({ ...options, dataDir });
    try {
      return await use(host);
    } finally {
      await host.stop();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
