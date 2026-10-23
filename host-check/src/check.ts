import { checkHost, type HostIssue } from "@powerhousedao/host-core";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("..", import.meta.url));

export interface HostReport {
  host: string;
  issues: HostIssue[];
}

/**
 * `checkHost` runs the `ph run` pipeline up to the verb against the env it is
 * handed, never `process.env`, and collects every issue instead of throwing at
 * the first. Nothing is started.
 */
export async function checkHosts(
  hosts: string[],
  env: Record<string, string | undefined>,
): Promise<HostReport[]> {
  return Promise.all(
    hosts.map(async (host) => ({
      host,
      issues: (await checkHost(host, { projectRoot, env })).issues,
    })),
  );
}

/** One line per issue: its stage, the path inside the host file, the message. */
export function formatReport({ host, issues }: HostReport): string {
  if (issues.length === 0) return `hosts/${host}/host.js: ok`;
  const lines = issues.map(
    (i) => `  ${i.stage}  ${i.path ? `${i.path}: ` : ""}${i.message}`,
  );
  return [`hosts/${host}/host.js`, ...lines].join("\n");
}
