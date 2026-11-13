// tsc fails against a @powerhousedao/desktop without app.json updates
// (powerhouse#3400): its types lack them. Skip the build there, as the tests
// and the demo skip, so the root `pnpm build` stays green until the pin moves.
import { spawnSync } from "node:child_process";

const desktop = await import("@powerhousedao/desktop");
if (typeof desktop.collectRelease !== "function") {
  console.log(
    "desktop-updates: @powerhousedao/desktop predates app.json updates (powerhouse#3400); skipping tsc.",
  );
  process.exit(0);
}
const result = spawnSync("tsc", { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
