import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { digestTree, ph, recipeDir } from "./cli.js";

const dist = join(recipeDir, "dist");
const indexFile = join(recipeDir, "index.ts");
const approvalFile = join(recipeDir, ".ph/build/release-approval.json");
const original = readFileSync(indexFile, "utf8");

afterEach(() => writeFileSync(indexFile, original));

const stageDirs = () =>
  readdirSync(recipeDir).filter((name) => name.startsWith(".dist.ph-stage-"));

describe("staged build", () => {
  beforeAll(() => {
    expect(ph("build").status).toBe(0);
  });

  it("leaves dist/ byte-identical when the build fails", () => {
    const before = digestTree(dist);
    writeFileSync(indexFile, `${original}\nexport const broken: number = "no";\n`);

    const result = ph("build");

    expect(result.status).not.toBe(0);
    expect(digestTree(dist)).toEqual(before);
    expect(stageDirs()).toEqual([]);
  });

  it("swaps in the new output when the build passes", () => {
    writeFileSync(indexFile, `${original}\nexport const added = 1;\n`);

    expect(ph("build").status).toBe(0);
    const built = readFileSync(join(dist, "browser/index.js"), "utf8");
    expect(built).toContain("added");
    expect(stageDirs()).toEqual([]);
  });
});

describe("release approval", () => {
  it("is written by build --release and verified by model check --prepack", () => {
    expect(ph("build", "--release").status).toBe(0);
    const approval = JSON.parse(readFileSync(approvalFile, "utf8"));
    expect(approval.kind).toBe("powerhouse.release-approval");
    expect(approval.publishedFiles.length).toBeGreaterThan(0);

    expect(ph("model", "check", "--prepack").status).toBe(0);
  });

  it("is refused once a published file changes", () => {
    expect(ph("build", "--release").status).toBe(0);
    appendFileSync(join(dist, "browser/index.js"), "\n// tampered\n");

    const check = ph("model", "check", "--prepack", "--json");

    expect(check.status).toBe(1);
    expect(JSON.parse(check.output.trim().split("\n")[0]).decision).not.toBe("ok");
  });

  it("goes stale when a plain build replaces dist/", () => {
    expect(ph("build", "--release").status).toBe(0);
    writeFileSync(indexFile, `${original}\nexport const changed = 2;\n`);
    expect(ph("build").status).toBe(0);
    expect(ph("model", "check", "--prepack").status).toBe(1);
  });
});
