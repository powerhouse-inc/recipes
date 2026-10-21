# Package Styles

Ship a package's own CSS without shipping a Connect theme. The package's stylesheet holds
only its own classes; a host's theme lives in a separate file that `ph build` never reads.

## What it demonstrates

| File | Owner | Read by |
|------|-------|---------|
| [`style.css`](./style.css) | The package | `ph build` (becomes `dist/style.css`) and the host's build |
| [`hosts/connect/style.css`](./hosts/connect/style.css) | This Connect | The host's build only |

`ph build` compiles `style.css` with `@reference "@powerhousedao/connect/theme.css"` and
Tailwind's utilities only. It scans `dist/browser`, so only code that ships adds classes, and the
output goes in the `external-packages` layer. Connect's tokens, variants and plugins
(`bg-background`, `dark:`, `scrollbar-thin`) resolve against the page's copy, so a package that
used to ship about 199 KB of CSS ships about 2 KB.

## Where a rule goes

- A token or rule your editors need: root `style.css`. It reaches every Connect that loads
  the package.
- A theme override for one Connect (palette, `:root.dark` values, global rules):
  `hosts/<host>/style.css`, next to the host's `routes` folder.
- In the host file, override a Connect token that only a package's classes use with
  `@theme static`. Without `static`, Tailwind drops tokens that no class on the page uses.
- Override a token the package itself defines (here `--color-brand`) with a plain `:root` rule.
  `ph build` puts the package's tokens in `@layer external-packages`, which outranks the host's
  `@theme`, and a rule outside any layer outranks both.

## Try it

This needs a Powerhouse release that includes powerhouse#3262. The repo's catalog version
(6.2.3-dev.25) predates it, and with that version `@powerhousedao/connect/tailwind.css` does
not resolve.

1. Copy the two files into a new project from `ph init`, keeping the paths. In an existing
   project, merge the root file's `@theme` block into your `style.css` rather than replacing it.
2. Run `ph connect studio`. Edits to `hosts/connect/style.css` apply without a reload.
3. Run `ph build` and open `dist/style.css`. The host file's `#0a7` and `#16181c` are absent.
   Move the `:root.dark` rule into the root `style.css` and build again: `#16181c` now ships
   with the package.

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
