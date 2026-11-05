# Staged Build

A failed, stopped or concurrent `ph build` used to leave `dist/` half written, and a package had no way to show that what `ph publish` sends is the build that passed its checks. `ph build` now writes to a sibling stage and swaps it in only when every step succeeds, and `ph build --release` records an approval that `ph publish --require-approval` verifies (powerhouse PR #3381).

## Status

**Unverified.** No published `@powerhousedao/ph-cli` carries #3381 yet (dev.94 predates it), so these tests have not been run. The catalog still pins dev.79, which lacks the feature. Once a release includes it, point this recipe at that version, run the tests and remove this section. The release-approval commands are experimental and can change in any release.

## How it works

| Behavior | What the tests check |
|----------|----------------------|
| Staged build | `ph build` writes to `.dist.ph-stage-<run>` and renames it over `dist/` on success. A type error leaves `dist/` byte-identical and no stage directory behind |
| Release approval | `ph build --release` writes `.ph/build/release-approval.json`, listing the files `npm pack` would publish with their SHA-256 |
| Verification | `ph model check --prepack` exits 0 while the published files match the approval, and 1 once one of them changes. `ph publish --require-approval` makes the same decision before it contacts the registry |

The package is as small as `ph build` allows: `index.ts` exports one constant. The tests edit it to break the build and restore it afterwards.

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
