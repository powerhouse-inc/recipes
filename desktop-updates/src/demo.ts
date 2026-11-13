import {
  collectRelease,
  releaseBaseUrl,
  releaseReport,
} from "@powerhousedao/desktop";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { releaseKeys } from "./keys.js";
import {
  fakeBundle,
  generateShell,
  loadRecipeApp,
  supported,
  updatesProblems,
} from "./updates.js";

if (!supported) {
  console.log(
    "This @powerhousedao/desktop predates app.json updates (powerhouse#3400). " +
      "Point the recipe at a release that has them.",
  );
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-updates-demo-"));
try {
  // 1. app.json: what the schema accepts and refuses.
  const app = loadRecipeApp();
  const keys = releaseKeys();
  console.log("1. hosts/desktop/app.json");
  console.log(`   updates: ${JSON.stringify({ github: app.updates?.github })} — accepted`);
  const refusals: Array<[string, unknown]> = [
    ["the private key", { github: "example/notes", pubkey: keys.secretKeyLookalike }],
    ["an http feed", { endpoints: ["http://updates.example.com/f.json"], pubkey: keys.pubkey }],
    ["both github and endpoints", { github: "example/notes", endpoints: ["https://u.example.com/f.json"], pubkey: keys.pubkey }],
  ];
  for (const [what, updates] of refusals) {
    console.log(`   ${what}: ${updatesProblems(updates).join("; ")}`);
  }

  // 2. The generated shell: the updater's settings, baked in.
  const shell = generateShell(app, path.join(work, "host"));
  console.log("\n2. tauri-shell/tauri.conf.json");
  console.log(
    JSON.stringify(
      {
        bundle: { createUpdaterArtifacts: shell.tauriConf.bundle.createUpdaterArtifacts },
        plugins: {
          updater: { ...shell.tauriConf.plugins?.updater, pubkey: "<app.json updates.pubkey>" },
        },
      },
      null,
      2,
    ).replace(/^/gm, "   "),
  );
  console.log(
    `   tauri.unsigned.conf.json (no TAURI_SIGNING_PRIVATE_KEY): ${JSON.stringify(shell.unsignedOverlay)}`,
  );

  // 3. What a signed Linux build leaves for its release.
  const bundleDir = path.join(work, "bundle");
  fakeBundle(bundleDir, [
    { dir: "deb", name: "Example Notes_1.2.0_amd64.deb", signed: true },
    { dir: "appimage", name: "Example Notes_1.2.0_amd64.AppImage", signed: true },
    { dir: "rpm", name: "Example Notes-1.2.0-1.x86_64.rpm", signed: false },
  ]);
  const env = { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.2.0" };
  const baseUrl = releaseBaseUrl(app.updates!, "1.2.0", env);
  const release = collectRelease({
    bundleDir,
    productName: app.productName,
    version: "1.2.0",
    baseUrl,
    platform: "linux",
    arch: "x64",
  });
  console.log("\n3. a signed Linux build, tag v1.2.0");
  for (const line of releaseReport(release, baseUrl)) console.log(`   ${line}`);
  console.log(
    fs
      .readFileSync(path.join(release.dir, release.feed!), "utf8")
      .replace(/^/gm, "   ")
      .trimEnd(),
  );
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
