import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { digestTree, ph, recipeDir } from "./cli.js";

const dist = join(recipeDir, "dist");
const indexFile = join(recipeDir, "index.ts");
const approvalFile = join(recipeDir, ".ph/build/release-approval.json");
const original = readFileSync(indexFile, "utf8");

afterEach(() => {
  writeFileSync(indexFile, original);
  rmSync(approvalFile, { force: true });
});

// The stage a run builds into, and the old output it retires while it
// installs the stage. Both are siblings of dist/ and go when the run ends.
const scratchDirs = () =>
  readdirSync(recipeDir).filter(
    (name) => name.startsWith(".dist.ph-stage-") || name.startsWith(".dist.ph-old-"),
  );

describe("staged build", () => {
  beforeAll(() => {
    expect(ph("build").status).toBe(0);
  });

  it("leaves dist/ byte-identical when the build fails", () => {
    const before = digestTree(dist);
    writeFileSync(indexFile, `${original}\nexport const broken: number = "no";\n`);

    const result = ph("build");

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/TS\d+/);
    expect(digestTree(dist)).toEqual(before);
    expect(scratchDirs()).toEqual([]);
  });

  it("swaps in the new output when the build passes", () => {
    writeFileSync(indexFile, `${original}\nexport const added = 1;\n`);

    expect(ph("build").status).toBe(0);
    const built = readFileSync(join(dist, "browser/index.js"), "utf8");
    expect(built).toContain("added");
    expect(scratchDirs()).toEqual([]);
  });
});

describe("release approval", () => {
  beforeEach(() => {
    // Each test starts from a build that matches the unmodified source.
    expect(ph("build").status).toBe(0);
  });

  it("is written by build --release and verified by model check --prepack", () => {
    expect(ph("build", "--release").status).toBe(0);
    const approval = JSON.parse(readFileSync(approvalFile, "utf8"));
    expect(approval.kind).toBe("powerhouse.release-approval");
    expect(approval.publishedFiles.length).toBeGreaterThan(0);

    expect(ph("model", "check", "--prepack").status).toBe(0);
  });

  it("is refused once a published file changes", () => {
    expect(ph("build", "--release").status).toBe(0);
    expect(existsSync(join(dist, "browser/index.js"))).toBe(true);
    appendFileSync(join(dist, "browser/index.js"), "\n// tampered\n");

    const check = ph("model", "check", "--prepack", "--json");

    expect(check.status).toBe(1);
    const report = JSON.parse(check.output.trim().split("\n")[0]);
    expect(report.decision).toBe("stale");
    expect(report.reasons.join("\n")).toContain("dist/browser/index.js");
  });

  it("goes stale when a plain build replaces dist/", () => {
    expect(ph("build", "--release").status).toBe(0);
    writeFileSync(indexFile, `${original}\nexport const changed = 2;\n`);
    expect(ph("build").status).toBe(0);
    expect(ph("model", "check", "--prepack").status).toBe(1);
  });
});
