// Runs the real `ph-cli build` before every test run, so the tests always read
// what the installed Powerhouse release produces. It takes a few seconds; a
// freshness check on the recipe's own files would miss a release bump.
import { spawnSync } from "node:child_process";
import { recipeDir } from "./css.js";

export default function setup() {
  // CI makes `ph build` fail on a type error instead of asking whether to go on.
  // One command string through the shell, so Windows finds pnpm.cmd.
  const result = spawnSync("pnpm exec ph-cli build", {
    cwd: recipeDir,
    shell: true,
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `ph-cli build failed (${result.error?.message ?? `exit ${result.status}`}):\n${result.stdout}\n${result.stderr}`,
    );
  }
}
