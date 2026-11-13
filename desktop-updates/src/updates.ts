import * as desktop from "@powerhousedao/desktop";
import {
  APP_JSON_FILE,
  appJsonSchema,
  loadAppJson,
  projectShell,
  type AppJson,
} from "@powerhousedao/desktop";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The desktop host this recipe ships: hosts/desktop/app.json. */
export const hostDir = path.resolve(
  import.meta.dirname,
  "..",
  "hosts",
  "desktop",
);

/** powerhouse#3400 added `updates` to app.json and the release collector.
 * Releases before it export neither. */
export const supported = typeof (desktop as Record<string, unknown>)
  .collectRelease === "function";

/** Every problem the app.json schema finds with an `updates` block, or [] when
 * it accepts it. The rest of the file is the recipe's own app.json. */
export function updatesProblems(updates: unknown): string[] {
  const app = JSON.parse(
    fs.readFileSync(path.join(hostDir, APP_JSON_FILE), "utf8"),
  ) as Record<string, unknown>;
  const result = appJsonSchema.safeParse({ ...app, updates });
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

/** What the generator writes for an app: the files the updater reads. */
export interface GeneratedShell {
  shellDir: string;
  tauriConf: {
    bundle: { createUpdaterArtifacts?: boolean };
    plugins?: {
      updater?: {
        pubkey: string;
        endpoints: string[];
        requireSignedVersion: boolean;
      };
    };
  };
  cargoToml: string;
  /** Permissions the Connect page is granted. */
  connectPermissions: unknown[];
  /** tauri.unsigned.conf.json, laid over the configuration by a build that
   * has no signing key; null when the app has no updates. */
  unsignedOverlay: unknown;
}

/**
 * Generates the Tauri shell for `app` the way `ph run desktop` does, in a
 * host folder of its own (`into`, or a new temporary one), and reads back
 * what the updater depends on. Nothing is compiled.
 */
export function generateShell(app: AppJson, into?: string): GeneratedShell {
  const dir = into ?? fs.mkdtempSync(path.join(os.tmpdir(), "desktop-updates-"));
  const { shellDir } = projectShell({
    hostDir: dir,
    app,
    connectPort: 3000,
    version: "1.2.0",
  });
  const read = (rel: string) => fs.readFileSync(path.join(shellDir, rel), "utf8");
  const overlay = path.join(shellDir, "tauri.unsigned.conf.json");
  return {
    shellDir,
    tauriConf: JSON.parse(read("tauri.conf.json")),
    cargoToml: read("Cargo.toml"),
    connectPermissions: JSON.parse(read("capabilities/connect.json"))
      .permissions,
    unsignedOverlay: fs.existsSync(overlay)
      ? JSON.parse(fs.readFileSync(overlay, "utf8"))
      : null,
  };
}

/** The recipe's app.json, parsed by the same loader `ph run desktop` uses. */
export function loadRecipeApp(): AppJson {
  return loadAppJson(hostDir);
}

/** An installer a fake build leaves, under `<bundle>/<dir>/<name>`. */
export interface FakeArtifact {
  dir: string;
  name: string;
  /** Write `<name>.sig` beside it, as a build with the signing key does. */
  signed: boolean;
}

/**
 * A `target/release/bundle` folder as `tauri build` leaves it, without
 * running tauri: placeholder installers, and for the signed ones a
 * placeholder signature. `collectRelease` copies files and reads signatures
 * as text; it checks neither, so placeholders show everything it does.
 */
export function fakeBundle(
  bundleDir: string,
  artifacts: FakeArtifact[],
): void {
  for (const artifact of artifacts) {
    const dir = path.join(bundleDir, artifact.dir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, artifact.name);
    fs.writeFileSync(file, `placeholder ${artifact.name}\n`);
    if (artifact.signed) {
      fs.writeFileSync(
        `${file}.sig`,
        Buffer.from(`signature of ${artifact.name}`).toString("base64") + "\n",
      );
    }
  }
}
