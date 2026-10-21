# Package Styles

Ship a package's own CSS without shipping a Connect theme. The package's stylesheet holds
only its own classes; a host's theme lives in a separate file that `ph build` never reads.

## What it demonstrates

| File | Owner | Read by |
|------|-------|---------|
| [`style.css`](./style.css) | The package | `ph build` (becomes `dist/style.css`) and the host's build |
| [`hosts/connect/style.css`](./hosts/connect/style.css) | This Connect | The host's build only |
| [`editors/index.ts`](./editors/index.ts) | The package | `ph build`, which finds `bg-brand` in its output |

The rest is the minimum `ph build` needs (`package.json`, `powerhouse.manifest.json`,
`tsconfig.json`, `index.ts`) and the tests in [`test/`](./test).

`ph build` compiles `style.css` with `@reference "@powerhousedao/connect/theme.css"` and
Tailwind's utilities only. It scans `dist/browser`, so only code that ships adds classes, and the
output goes in the `external-packages` layer. Connect's tokens, variants and plugins
(`bg-background`, `dark:`, `scrollbar-thin`) resolve against the page's copy, so a package that
used to ship about 199 KB of CSS ships about 2 KB.

## Where a rule goes

- A token or rule your editors need: root `style.css`. It reaches every Connect that loads
  the package. A `@theme` token ships only if a class in the browser build uses it: this
  recipe's editor uses `bg-brand`, so `--color-brand` ships. A plain rule always ships.
- A theme override for one Connect (palette, `:root.dark` values, global rules):
  `hosts/<host>/style.css`, next to the host's `routes` folder.
- In the host file, override a Connect token that only a package's classes use with
  `@theme static`. Without `static`, Tailwind drops tokens that no class on the page uses.
- Override a token the package itself defines (here `--color-brand`) with a plain `:root` rule.
  `ph build` puts the package's tokens in `@layer external-packages`, which outranks the host's
  `@theme`, and a rule outside any layer outranks both.

## Try it

This needs a Powerhouse release that includes powerhouse#3262. With an older one,
`@powerhousedao/connect/tailwind.css` does not resolve and `ph build` fails.

1. Copy the two stylesheets into a new project from `ph init`, keeping the paths, and use
   `bg-brand` in one of its editors. In an existing project, merge the root file's `@theme`
   block into your `style.css` rather than replacing it.
2. Run `ph connect studio`. Edits to `hosts/connect/style.css` apply without a reload.
3. Run `ph build` and open `dist/style.css`. Inside `@layer external-packages` it has the
   package's `--color-brand: #f60` and the `.bg-brand` class. The host file's `#0a7`, `#16181c`
   and `#b42318` are absent. Move the `:root.dark` rule into the root `style.css` and build
   again: `#16181c` now ships with the package.

## Run the tests

```sh
pnpm --filter @powerhousedao/example-package-styles test
```

This runs `ph-cli build` on the recipe, then checks the claims above without a browser:

- `dist/style.css` starts with Connect's layer order and puts everything else in
  `@layer external-packages`. It defines `--color-brand: #f60` and no other token, has no
  reset, and has none of the host file's values.
- With the `:root.dark` rule moved into the root `style.css`, `#16181c` ships (step 3).
- The host's page build, the root `style.css` with `hosts/connect/style.css` imported last, sets
  `--color-brand: #0a7` in a `:root` rule outside any layer, after the package's `@theme` value.
  It sets `--background: #16181c` under `:root.dark`, and emits `--color-red-700: #b42318`
  with no class using it.

The tests need the same Powerhouse release as the steps above.

## Migrating an existing project

`ph migrate` removes the old package-CSS imports, creates `hosts/connect/style.css` if missing,
and warns when the root `style.css` sets custom properties or `:root`, `html`, `body` or `.dark`
rules. It does not move them: move the ones that are this Connect's theme into the host file,
or they ship with the package and re-theme every Connect that installs it. The warning also
fires on the package's own tokens, such as this recipe's `--color-brand`. Keep those in the
root file.

A Tailwind host that imported `@powerhousedao/connect-core/theme.css` for core's classes now
imports `@powerhousedao/connect-core/tailwind.css`.

Source: [powerhouse#3262](https://github.com/powerhouse-inc/powerhouse/pull/3262).
