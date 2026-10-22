import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Regenerates .ph/ from hosts/connect/routes/, so the spec never reads a tree
// left over from an earlier build. Type errors are the build script's check;
// this one is about where the routes land.
export default function setup() {
  try {
    execFileSync("pnpm", ["exec", "ph-cli", "build", "--ignore-type-errors"], {
      cwd: root,
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `ph-cli build failed:\n${stdout?.toString() ?? ""}${stderr?.toString() ?? ""}`,
    );
  }
}
