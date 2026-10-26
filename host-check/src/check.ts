import {
  checkHost,
  type CheckHostResult,
  type HostIssue,
} from "@powerhousedao/host-core";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("..", import.meta.url));

export interface HostReport {
  host: string;
  issues: HostIssue[];
  /** `$output` tokens checked declared-only: a clean report does not cover them. */
  deferred: CheckHostResult["deferred"];
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
      ...(await checkHost(host, { projectRoot, env })),
    })),
  );
}

/** Issues grouped by the file they came from, with each hint under its issue. */
export function formatReport({ host, issues, deferred }: HostReport): string {
  if (issues.length === 0) {
    const note =
      deferred.length > 0
        ? `\n  ${deferred.length} output token(s) checked declared-only`
        : "";
    return `hosts/${host}/host.js: ok${note}`;
  }
  const byFile = new Map<string, HostIssue[]>();
  for (const issue of issues) {
    byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  }
  return [...byFile]
    .map(([file, found]) => {
      const lines = found.flatMap((i) => {
        const line = `  ${i.stage}  ${i.path ? `${i.path}: ` : ""}${i.message}`;
        return i.hint ? [line, `    hint: ${i.hint}`] : [line];
      });
      return [file, ...lines].join("\n");
    })
    .join("\n\n");
}
