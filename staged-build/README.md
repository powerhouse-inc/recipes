# Staged Build

A failed, stopped or concurrent `ph build` used to leave `dist/` half written, and a package had no way to show that what `ph publish` sends is the build that passed its checks. `ph build` now writes to a sibling stage and swaps it in only when every step succeeds, and `ph build --release` records an approval that `ph publish --require-approval` verifies (powerhouse PR #3381).

## Status

Runs against `@powerhousedao/ph-cli` 6.2.3-dev.102, the first published build with #3381, which this recipe pins itself (the workspace catalog stays on dev.79). The release-approval commands are experimental and can change in any release.

## How it works

| Behavior | What the tests check |
|----------|----------------------|
| Staged build | `ph build` writes to a sibling `.dist.ph-stage-<run>` and moves it into `dist/` only when every step succeeds, journaling the run under `.ph/build/runs` so a killed build is rolled back or finished on the next one. A type error exits 1, leaves `dist/` byte-identical, and leaves no `.dist.ph-stage-*` or `.dist.ph-old-*` directory behind |
| Release approval | `ph build --release` packs the package, installs the tarball in a scratch consumer and imports every `exports` entry under the node and browser conditions, then writes `.ph/build/release-approval.json`, listing the files `npm pack` would publish with their SHA-256 |
| Verification | `ph model check --prepack` exits 0 (`approved`) while the published files match the approval, and 1 (`stale`, naming the changed file) once one of them changes or a plain `ph build` replaces `dist/`. `--json` prints `{"decision", "reasons"}`. `ph publish --require-approval` makes the same decision before it contacts the registry |

The package is as small as `ph build` allows: `index.ts` exports one constant. The tests edit it to break the build and restore it afterwards. Even so, `ph build` needs a few things a bare package lacks:

- `tailwindcss` and `@tailwindcss/cli`, and `@powerhousedao/connect` for the theme the stylesheet step imports: `ph build` always compiles `dist/style.css`.
- An `exports` map pointing at `dist/`. Without one, the `--release` consumer check imports the package's bare name, finds no `index.js`, and writes no approval.

## Running

```bash
pnpm test
```

By hand, in a project from `ph init`:

```bash
ph build --release
ph model check --prepack      # exit 0
echo "// edit" >> dist/browser/index.js
ph model check --prepack      # exit 1, naming the changed file
ph publish --require-approval # refuses before contacting the registry
```

To stop a plain `npm publish` too, add `"prepack": "ph-cli model check --prepack"` to `package.json` and run `ph build --release` again, since `package.json` is published and the approval covers it.

Without an approval file, `ph publish` behaves as before.
