// What `ph build` ships: dist/style.css, built by the real CLI in globalSetup.
import { compile } from "@tailwindcss/node";
import {
  packageStyleEntry,
  packageStylesheet,
} from "@powerhousedao/shared/clis/package-style";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  declarations,
  definedProperties,
  enclosing,
  recipeDir,
  squash,
} from "./css.js";

const LAYER_ORDER =
  "@layerproperties,theme,base,components,external-packages,utilities;";
const WRAPPER = "@layerexternal-packages{";

// The host file's values: none may reach the package's stylesheet.
const HOST_VALUES = ["#0a7", "#16181c", "#b42318"];

const shipped = readFileSync(join(recipeDir, "dist/style.css"), "utf8");
const css = squash(shipped);

describe("dist/style.css from ph build", () => {
  it("declares Connect's layer order, then wraps everything in external-packages", () => {
    expect(css.startsWith(LAYER_ORDER)).toBe(true);
    const body = css.slice(LAYER_ORDER.length);
    expect(body.startsWith(WRAPPER)).toBe(true);
    // The wrapper's closing brace is the file's last character.
    expect(enclosing(body, body.length - 1)).toEqual(["@layerexternal-packages"]);
    expect(body.endsWith("}")).toBe(true);
  });

  it("ships the package's own token, because the editor uses bg-brand", () => {
    const brand = declarations(css, "--color-brand");
    expect(brand.map((d) => d.value)).toEqual(["#f60"]);
    expect(brand[0].blocks[0]).toBe("@layerexternal-packages");
    expect(css).toMatch(/\.bg-brand\{background-color:var\(--color-brand\)/);
  });

  it("ships Connect's classes it uses, but not Connect's tokens or reset", () => {
    // text-red-700 is in the editor: the class ships and reads the page's
    // token. Tailwind adds Connect's value as the var() fallback.
    expect(css).toMatch(/\.text-red-700\{color:var\(--color-red-700[,)]/);
    // The only custom property it defines is the package's own token.
    const others = [...definedProperties(css)].filter(
      (p) => p !== "--color-brand" && !p.startsWith("--tw-"),
    );
    expect(others).toEqual([]);
    expect(css).not.toContain("box-sizing");
  });

  it("never reads the host file", () => {
    for (const value of HOST_VALUES) expect(css).not.toContain(value);
  });

  it("is a package's few classes, not Connect's whole stylesheet", () => {
    expect(Buffer.byteLength(shipped)).toBeLessThan(10_000);
  });
});

// README "Try it" step 3: a rule in the root style.css ships with the package.
// The same pipeline as `ph build`, in process.
async function packageBuild(rootCss: string) {
  const entry = packageStyleEntry(rootCss, { browserDir: "./dist/browser" });
  const compiler = await compile(entry, {
    base: recipeDir,
    onDependency: () => {},
  });
  return squash(packageStylesheet(compiler.build([])));
}

describe("moving the host's :root.dark rule into the root style.css", () => {
  const root = readFileSync(join(recipeDir, "style.css"), "utf8");
  const host = readFileSync(join(recipeDir, "hosts/connect/style.css"), "utf8");
  const darkRule = host.match(/:root\.dark\s*\{[^}]*\}/)?.[0];

  it("finds the rule in the host file", () => {
    expect(darkRule).toContain("#16181c");
  });

  it("ships it with the package, where every Connect that loads it gets it", async () => {
    const moved = await packageBuild(`${root}\n${darkRule}\n`);
    const [background] = declarations(moved, "--background");
    expect(background.value).toBe("#16181c");
    expect(background.blocks).toEqual(["@layerexternal-packages", ":root.dark"]);
  });

  it("ships nothing of it while it stays in the host file", async () => {
    expect(await packageBuild(root)).not.toContain("#16181c");
  });
});
