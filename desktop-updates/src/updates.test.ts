import {
  appJsonSchema,
  collectRelease,
  feedFileName,
  releaseBaseUrl,
  releaseFileName,
  releaseReport,
  updateEndpoints,
  type AppJson,
} from "@powerhousedao/desktop";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { releaseKeys } from "./keys.js";
import {
  fakeBundle,
  generateShell,
  loadRecipeApp,
  supported,
  updatesProblems,
} from "./updates.js";

const keys = releaseKeys();
const temps: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-updates-test-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!supported)("app.json updates", () => {
  it("accepts the recipe's app.json, which asks a GitHub repository", () => {
    const app = loadRecipeApp();
    expect(app.updates?.github).toBe("example/notes");
    expect(updateEndpoints(app.updates!)).toEqual([
      "https://github.com/example/notes/releases/latest/download/latest-{{target}}-{{arch}}.json",
    ]);
  });

  it("is off when omitted or null", () => {
    expect(updatesProblems(null)).toEqual([]);
    expect(updatesProblems(undefined)).toEqual([]);
  });

  it("takes https endpoints in place of a repository", () => {
    const endpoints = ["https://updates.example.com/latest-{{target}}-{{arch}}.json"];
    expect(updatesProblems({ endpoints, pubkey: keys.pubkey })).toEqual([]);
    const app = appJsonSchema.parse({
      ...loadRecipeApp(),
      updates: { endpoints, pubkey: keys.pubkey },
    });
    expect(updateEndpoints(app.updates!)).toEqual(endpoints);
  });

  it("refuses the private key where the public one belongs", () => {
    const problems = updatesProblems({
      github: "example/notes",
      pubkey: keys.secretKeyLookalike,
    });
    expect(problems.join("\n")).toMatch(/PRIVATE key/);
  });

  it("refuses anything that is not a signing key", () => {
    const problems = updatesProblems({
      github: "example/notes",
      pubkey: Buffer.from("hello").toString("base64"),
    });
    expect(problems.join("\n")).toMatch(/not an update signing key/);
  });

  it("refuses a feed that is not https", () => {
    const problems = updatesProblems({
      endpoints: ["http://updates.example.com/latest.json"],
      pubkey: keys.pubkey,
    });
    expect(problems).toContain("an update feed must be an https address");
  });

  it("takes exactly one of github and endpoints", () => {
    const both = updatesProblems({
      github: "example/notes",
      endpoints: ["https://updates.example.com/latest.json"],
      pubkey: keys.pubkey,
    });
    const neither = updatesProblems({ pubkey: keys.pubkey });
    expect(both).toContain("updates: set github OR endpoints");
    expect(neither).toContain("updates: set github OR endpoints");
  });
});

describe.skipIf(!supported)("the generated shell", () => {
  it("carries the feed, the key and the signed-version check", () => {
    const app = loadRecipeApp();
    const shell = generateShell(app, tempDir());
    const updater = shell.tauriConf.plugins?.updater;
    expect(updater).toEqual({
      pubkey: app.updates!.pubkey,
      endpoints: updateEndpoints(app.updates!),
      requireSignedVersion: true,
    });
    expect(shell.tauriConf.bundle.createUpdaterArtifacts).toBe(true);
    // generate_context! names serde_json once there is a plugins block.
    expect(shell.cargoToml).toMatch(/^serde_json = "1"$/m);
    // A build without TAURI_SIGNING_PRIVATE_KEY lays this over the config.
    expect(shell.unsignedOverlay).toEqual({
      bundle: { createUpdaterArtifacts: false },
    });
  });

  it("grants the update commands to every app, with or without updates", () => {
    const off: AppJson = { ...loadRecipeApp(), updates: null };
    for (const app of [loadRecipeApp(), off]) {
      expect(generateShell(app, tempDir()).connectPermissions).toEqual(
        expect.arrayContaining([
          "allow-update-state",
          "allow-update-check",
          "allow-update-install",
        ]),
      );
    }
  });

  it("drops the updater settings when updates are turned off again", () => {
    const dir = tempDir();
    generateShell(loadRecipeApp(), dir);
    const shell = generateShell({ ...loadRecipeApp(), updates: null }, dir);
    expect(shell.tauriConf.plugins).toBeUndefined();
    expect(shell.tauriConf.bundle.createUpdaterArtifacts).toBeUndefined();
    expect(shell.cargoToml).not.toMatch(/serde_json/);
    expect(shell.unsignedOverlay).toBeNull();
  });
});

describe.skipIf(!supported)("the release folder", () => {
  const productName = "Example Notes";
  const version = "1.2.0";
  const tagEnv = { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.2.0" };

  it("downloads from the GitHub release of the tag the workflow runs for", () => {
    const updates = loadRecipeApp().updates!;
    expect(releaseBaseUrl(updates, version, tagEnv)).toBe(
      "https://github.com/example/notes/releases/download/v1.2.0",
    );
    // Off a tag: v<version>.
    expect(releaseBaseUrl(updates, version, {})).toBe(
      "https://github.com/example/notes/releases/download/v1.2.0",
    );
  });

  it("lets PH_DESKTOP_RELEASE_URL override the address, https only", () => {
    const updates = loadRecipeApp().updates!;
    expect(
      releaseBaseUrl(updates, version, {
        PH_DESKTOP_RELEASE_URL: "https://cdn.example.com/notes/1.2.0/",
      }),
    ).toBe("https://cdn.example.com/notes/1.2.0");
    expect(() =>
      releaseBaseUrl(updates, version, {
        PH_DESKTOP_RELEASE_URL: "http://cdn.example.com/notes",
      }),
    ).toThrow(/must be the https address/);
  });

  it("has no address for an app with its own endpoints, unless told one", () => {
    const updates = { endpoints: ["https://u.example.com/f.json"], pubkey: keys.pubkey };
    expect(releaseBaseUrl(updates, version, {})).toBeNull();
  });

  it("gathers signed Linux installers and writes one feed for the system", () => {
    const bundleDir = tempDir();
    fakeBundle(bundleDir, [
      { dir: "deb", name: "Example Notes_1.2.0_amd64.deb", signed: true },
      { dir: "appimage", name: "Example Notes_1.2.0_amd64.AppImage", signed: true },
    ]);
    const baseUrl = releaseBaseUrl(loadRecipeApp().updates!, version, tagEnv);
    const release = collectRelease({
      bundleDir,
      productName,
      version,
      baseUrl,
      platform: "linux",
      arch: "x64",
      now: new Date("2026-11-13T00:00:00Z"),
    });

    expect(release.feed).toBe(feedFileName("linux", "x86_64"));
    expect(release.targets).toEqual(["linux-x86_64-appimage", "linux-x86_64-deb"]);
    // GitHub would rewrite the space to a dot; the collector does it first.
    expect(release.files).toEqual([
      "Example.Notes_1.2.0_amd64.deb",
      "Example.Notes_1.2.0_amd64.AppImage",
      "latest-linux-x86_64.json",
    ]);
    expect(fs.readdirSync(release.dir).sort()).toEqual([...release.files].sort());

    const feed = JSON.parse(
      fs.readFileSync(path.join(release.dir, release.feed!), "utf8"),
    );
    expect(feed).toEqual({
      version,
      pub_date: "2026-11-13T00:00:00.000Z",
      platforms: {
        "linux-x86_64-deb": {
          signature: Buffer.from(
            "signature of Example Notes_1.2.0_amd64.deb",
          ).toString("base64"),
          url: `${baseUrl}/${releaseFileName("Example Notes_1.2.0_amd64.deb")}`,
        },
        "linux-x86_64-appimage": {
          signature: Buffer.from(
            "signature of Example Notes_1.2.0_amd64.AppImage",
          ).toString("base64"),
          url: `${baseUrl}/Example.Notes_1.2.0_amd64.AppImage`,
        },
      },
    });
    expect(releaseReport(release, baseUrl).at(-1)).toMatch(
      /latest-linux-x86_64\.json offers linux-x86_64-appimage, linux-x86_64-deb/,
    );
  });

  it("leaves an unsigned installer out of the feed, and reports it", () => {
    const bundleDir = tempDir();
    fakeBundle(bundleDir, [
      { dir: "deb", name: "notes_1.2.0_amd64.deb", signed: true },
      { dir: "rpm", name: "notes-1.2.0-1.x86_64.rpm", signed: false },
    ]);
    const baseUrl = "https://cdn.example.com/notes";
    const release = collectRelease({
      bundleDir,
      productName,
      version,
      baseUrl,
      platform: "linux",
      arch: "x64",
    });
    expect(release.targets).toEqual(["linux-x86_64-deb"]);
    expect(release.unsigned).toEqual(["notes-1.2.0-1.x86_64.rpm"]);
    expect(release.files).toContain("notes-1.2.0-1.x86_64.rpm");
    expect(releaseReport(release, baseUrl)).toContain(
      "notes-1.2.0-1.x86_64.rpm has no signature, so the feed does not offer it.",
    );
  });

  it("names the macOS archive for its version and processor", () => {
    const bundleDir = tempDir();
    fakeBundle(bundleDir, [
      { dir: "dmg", name: "Example Notes_1.2.0_aarch64.dmg", signed: false },
      { dir: "macos", name: "Example Notes.app.tar.gz", signed: true },
    ]);
    const release = collectRelease({
      bundleDir,
      productName,
      version,
      baseUrl: "https://cdn.example.com/notes",
      platform: "darwin",
      arch: "arm64",
    });
    expect(release.files).toEqual([
      "Example.Notes_1.2.0_aarch64.dmg",
      "Example.Notes_1.2.0_aarch64.app.tar.gz",
      "latest-darwin-aarch64.json",
    ]);
    expect(release.targets).toEqual(["darwin-aarch64-app"]);
    // The disk image is for people, not the updater: it is never "unsigned".
    expect(release.unsigned).toEqual([]);
  });

  it("leaves out what an earlier build wrote", () => {
    const bundleDir = tempDir();
    fakeBundle(bundleDir, [
      { dir: "deb", name: "notes_1.1.0_amd64.deb", signed: true },
    ]);
    const old = new Date(Date.now() - 60_000);
    for (const name of ["notes_1.1.0_amd64.deb", "notes_1.1.0_amd64.deb.sig"]) {
      fs.utimesSync(path.join(bundleDir, "deb", name), old, old);
    }
    fakeBundle(bundleDir, [
      { dir: "deb", name: "notes_1.2.0_amd64.deb", signed: true },
    ]);
    const release = collectRelease({
      bundleDir,
      productName,
      version,
      baseUrl: "https://cdn.example.com/notes",
      since: Date.now() - 5_000,
      platform: "linux",
      arch: "x64",
    });
    expect(release.files).toEqual([
      "notes_1.2.0_amd64.deb",
      "latest-linux-x86_64.json",
    ]);
  });

  it("writes no feed without a download address", () => {
    const bundleDir = tempDir();
    fakeBundle(bundleDir, [
      { dir: "deb", name: "notes_1.2.0_amd64.deb", signed: true },
    ]);
    const release = collectRelease({
      bundleDir,
      productName,
      version,
      baseUrl: null,
      platform: "linux",
      arch: "x64",
    });
    expect(release.feed).toBeNull();
    expect(release.files).toEqual(["notes_1.2.0_amd64.deb"]);
    expect(releaseReport(release, null).at(-1)).toMatch(
      /set PH_DESKTOP_RELEASE_URL/,
    );
  });
});
