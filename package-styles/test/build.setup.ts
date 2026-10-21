// Runs the real `ph-cli build` once, so `pnpm test` works on its own. Skipped
// when dist/style.css is newer than every input, as it is right after the
// recipes CI job's build phase.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { recipeDir } from "./css.js";

const INPUTS = [
  "package.json",
  "powerhouse.manifest.json",
  "tsconfig.json",
  "style.css",
  "index.ts",
  "editors",
];

function newestInput(): number {
  const mtimes = INPUTS.flatMap((input) => {
    const path = join(recipeDir, input);
    if (!existsSync(path)) return [];
    if (!statSync(path).isDirectory()) return [statSync(path).mtimeMs];
    return readdirSync(path, { recursive: true, encoding: "utf8" }).map(
      (file) => statSync(join(path, file)).mtimeMs,
    );
  });
  return Math.max(...mtimes);
}

export default function setup() {
  const output = join(recipeDir, "dist/style.css");
  if (existsSync(output) && statSync(output).mtimeMs > newestInput()) return;
  // CI makes `ph build` fail on a type error instead of asking whether to go on.
  const result = spawnSync("pnpm", ["exec", "ph-cli", "build"], {
    cwd: recipeDir,
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `ph-cli build failed (${result.error?.message ?? `exit ${result.status}`}):\n${result.stdout}\n${result.stderr}`,
    );
  }
}
