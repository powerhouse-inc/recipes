// What a host's page build compiles: the root style.css with
// hosts/connect/style.css imported last, as Connect's Vite plugin serves it.
import { compile } from "@tailwindcss/node";
import {
  hostStylesheetPath,
  withHostStylesheet,
} from "@powerhousedao/builder-tools";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { declarations, recipeDir, squash } from "./css.js";

const stylesheet = join(recipeDir, "style.css");
const hostFile = hostStylesheetPath(recipeDir);
const input = withHostStylesheet(
  readFileSync(stylesheet, "utf8"),
  stylesheet,
  hostFile,
);

async function pageBuild(candidates: string[]) {
  const compiler = await compile(input, {
    base: recipeDir,
    onDependency: () => {},
  });
  return squash(compiler.build(candidates));
}

describe("the host's page build", () => {
  let page: string;
  let bare: string;
  beforeAll(async () => {
    page = await pageBuild(["bg-brand"]);
    bare = await pageBuild([]);
  });

  it("imports hosts/connect/style.css after the root style.css", () => {
    expect(hostFile).toBe(join(recipeDir, "hosts/connect/style.css"));
    expect(input.trimEnd().endsWith('@import "./hosts/connect/style.css";')).toBe(
      true,
    );
  });

  it("sets --color-brand to the host's value in a rule outside any layer, after the package's @theme", () => {
    const brand = declarations(page, "--color-brand");
    expect(brand.map((d) => d.value)).toEqual(["#f60", "#0a7"]);
    const [pkg, host] = brand;
    expect(pkg.blocks[0]).toBe("@layer theme");
    expect(host.blocks).toEqual([":root"]);
    expect(host.index).toBeGreaterThan(pkg.index);
  });

  it("sets the dark background in :root.dark", () => {
    const background = declarations(page, "--background").filter(
      (d) => d.value === "#16181c",
    );
    expect(background.map((d) => d.blocks)).toEqual([[":root.dark"]]);
  });

  it("emits the @theme static override even when no class uses it", () => {
    const red = declarations(bare, "--color-red-700");
    expect(red.map((d) => d.value)).toEqual(["#b42318"]);
    expect(red[0].blocks[0]).toBe("@layer theme");
  });
});
