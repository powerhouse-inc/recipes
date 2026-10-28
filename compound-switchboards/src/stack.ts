import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnHost, type SpawnedHost } from "@powerhousedao/host-core";
import type { SwitchboardOutputs } from "@powerhousedao/ph-cli/runners/switchboard";

/** This recipe is the project: hosts/stack, hosts/sb-a, hosts/sb-b. */
export const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/** Two switchboards boot in one child, so allow more than a single host. */
export const READY_TIMEOUT_MS = 120_000;

/** The compound's children, keyed as in hosts/stack/host.js. */
export interface StackMembers {
  a: SwitchboardOutputs;
  b: SwitchboardOutputs;
}

/**
 * Each member's outputs from the run record. A compound has no outputs of
 * its own: `host.outputs` is undefined and `host.members` carries one entry
 * per child.
 */
export function membersOf(host: SpawnedHost): StackMembers {
  const a = host.members?.a?.outputs;
  const b = host.members?.b?.outputs;
  if (!a || !b) {
    throw new Error(
      `expected members a and b, got ${JSON.stringify(host.members)}`,
    );
  }
  return { a: a as SwitchboardOutputs, b: b as SwitchboardOutputs };
}

/**
 * Runs `ph run stack` in a throwaway data dir with `env` as the operator's
 * env, hands the running host to `use`, and always stops the host and removes
 * the dir afterwards.
 */
export async function withStack<T>(
  env: Record<string, string>,
  use: (host: SpawnedHost, members: StackMembers) => Promise<T>,
): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), "ph-stack-"));
  try {
    const host = await spawnHost({
      projectRoot,
      host: "stack",
      dataDir,
      env,
      readyTimeoutMs: READY_TIMEOUT_MS,
    });
    try {
      return await use(host, membersOf(host));
    } finally {
      await host.stop();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** Whether the member serves the inspection subgraph. A member with
 * inspection off has no route there and answers 404. */
export async function inspectionAnswers(origin: string): Promise<boolean> {
  const response = await fetch(`${origin}/graphql/inspection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

/** Whether the member serves a drive with this slug. */
export async function driveAnswers(
  origin: string,
  slug: string,
): Promise<boolean> {
  const response = await fetch(`${origin}/d/${slug}`, {
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}
