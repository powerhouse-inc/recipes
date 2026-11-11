import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const recipeDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Runs the installed ph-cli. CI makes a type error fail the build instead of asking. */
export function ph(...args: string[]) {
  const result = spawnSync("pnpm", ["exec", "ph-cli", ...args], {
    cwd: recipeDir,
    shell: process.platform === "win32",
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    encoding: "utf8",
    timeout: 110_000,
  });
  if (result.error || result.status === null) {
    throw new Error(`ph-cli ${args.join(" ")} did not run: ${result.error?.message ?? "no exit status"}`);
  }
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

/** Every file under `dir` mapped to its SHA-256, keyed by POSIX path. */
export function digestTree(dir: string): Record<string, string> {
  const digests: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const key = relative(dir, path).split("\\").join("/");
        digests[key] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  walk(dir);
  return digests;
}
