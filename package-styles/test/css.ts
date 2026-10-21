// Helpers for reading compiled CSS by structure rather than by snapshot.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const recipeDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The CSS with comments and all whitespace removed, so minified and
 * pretty-printed output compare alike. */
export function squash(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
}

/** The preludes of the blocks around `index` in squashed CSS, outermost first:
 * ["@layertheme", ":root,:host"] for a token in Tailwind's theme layer. */
export function enclosing(css: string, index: number): string[] {
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < index; i++) {
    const c = css[i];
    if (c === "{") {
      stack.push(css.slice(start, i));
      start = i + 1;
    } else if (c === "}") {
      stack.pop();
      start = i + 1;
    } else if (c === ";") {
      start = i + 1;
    }
  }
  return stack;
}

/** Every value `name` is set to in squashed CSS, in source order, with the
 * blocks each sits in. */
export function declarations(css: string, name: string) {
  const found: { value: string; index: number; blocks: string[] }[] = [];
  const pattern = new RegExp(`(?<=[{;])${name}:([^;}]*)`, "g");
  for (const match of css.matchAll(pattern)) {
    found.push({
      value: match[1],
      index: match.index,
      blocks: enclosing(css, match.index),
    });
  }
  return found;
}

/** The custom properties a stylesheet defines (not the ones it reads). */
export function definedProperties(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/(?<=[{;])(--[\w-]+):/g)].map((match) => match[1]),
  );
}
