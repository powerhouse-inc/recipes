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
  classes,
  declarations,
  definedProperties,
  enclosing,
  recipeDir,
  squash,
} from "./css.js";

const LAYER_ORDER =
  "@layer properties,theme,base,components,external-packages,utilities;";
const WRAPPER = "@layer external-packages{";

// The host file's values: none may reach the package's stylesheet.
const HOST_VALUES = ["#0a7", "#16181c", "#b42318"];

const root = readFileSync(join(recipeDir, "style.css"), "utf8");
const host = readFileSync(join(recipeDir, "hosts/connect/style.css"), "utf8");
const shipped = readFileSync(join(recipeDir, "dist/style.css"), "utf8");
const css = squash(shipped);

describe("dist/style.css from ph build", () => {
  it("declares Connect's layer order, then wraps everything in external-packages", () => {
    expect(css.startsWith(LAYER_ORDER)).toBe(true);
    const body = css.slice(LAYER_ORDER.length);
    expect(body.startsWith(WRAPPER)).toBe(true);
    // The wrapper's closing brace is the file's last character.
    expect(enclosing(body, body.length - 1)).toEqual([
      "@layer external-packages",
    ]);
    expect(body.endsWith("}")).toBe(true);
  });

  it("ships only the classes in dist/browser", () => {
    // Not the ones the README and tests name, such as bg-background.
    expect([...classes(css)].sort()).toEqual(["bg-brand", "text-red-700"]);
  });

  it("skips dist/browser's source maps, so a class named in a comment stays out", () => {
    // The map keeps editors/index.ts's comments; the bundle drops them.
    const map = JSON.parse(
      readFileSync(
        join(recipeDir, "dist/browser/editors/index.js.map"),
        "utf8",
      ),
    ) as { sourcesContent?: string[] };
    expect(map.sourcesContent?.join("\n")).toMatch(/\bunderline\b/);
    expect(classes(css)).not.toContain("underline");
  });

  it("ships the package's own token, which bg-brand reads", () => {
    const brand = declarations(css, "--color-brand");
    expect(brand.map((d) => d.value)).toEqual(["#f60"]);
    expect(brand[0].blocks[0]).toBe("@layer external-packages");
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
    for (const value of HOST_VALUES) {
      expect(host).toContain(value);
      expect(css).not.toContain(value);
    }
  });

  it("is a package's few classes, not Connect's whole stylesheet", () => {
    expect(Buffer.byteLength(shipped)).toBeLessThan(10_000);
  });
});

// The same pipeline as `ph build`, in process, with the classes `ph build`
// would find in dist/browser given as `candidates`.
async function packageBuild(rootCss: string, candidates: string[] = []) {
  const entry = packageStyleEntry(rootCss, { browserDir: "./dist/browser" });
  const compiler = await compile(entry, {
    base: recipeDir,
    onDependency: () => {},
  });
  return squash(packageStylesheet(compiler.build(candidates)));
}

describe("a @theme token in the root style.css", () => {
  it("ships only when a class in the browser build uses it", async () => {
    expect(definedProperties(await packageBuild(root))).not.toContain(
      "--color-brand",
    );
    expect(
      definedProperties(await packageBuild(root, ["bg-brand"])),
    ).toContain("--color-brand");
  });
});

// README "Try it" step 3: a rule in the root style.css ships with the package.
describe("moving the host's :root.dark rule into the root style.css", () => {
  const darkRule = host.match(/:root\.dark\s*\{[^}]*\}/)?.[0];

  it("finds the rule in the host file", () => {
    expect(darkRule).toContain("#16181c");
  });

  it("ships it with the package, where every Connect that loads it gets it", async () => {
    const moved = await packageBuild(`${root}\n${darkRule}\n`);
    const [background] = declarations(moved, "--background");
    expect(background.value).toBe("#16181c");
    expect(background.blocks).toEqual([
      "@layer external-packages",
      ":root.dark",
    ]);
  });

  it("ships nothing of it while it stays in the host file", async () => {
    expect(await packageBuild(root)).not.toContain("#16181c");
  });
});
