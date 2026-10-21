# Connect Routes

Adding pages to Connect (the Powerhouse web app) from a project, with TanStack Router file routes in `hosts/connect/routes/`. No Connect code is forked: Connect reads the folder, generates the route tree into `.ph/connect-routes.gen.ts`, and mounts the routes beside its own.

## What it demonstrates

- `_app/inventory.tsx` renders inside Connect's layout at `/inventory`. `staticData.nav` lists it in the sidebar, after the drives, ordered by `order`.
- Its `loader` reads Connect's store from the router context (`context.store.drives`), and its `head` sets the page title with the app name from `match.context.appName`.
- `_app/settings/inventory.tsx` adds a tab to `/settings` through `staticData.settings`. `enabled` hides the tab, and redirects its URL to the first tab, while it returns false.
- `status.tsx` sits outside `_app/`, so `/status` is a full page without the sidebar.

## Rules

- Connect reads routes only from `hosts/connect/routes/`.
- A file in `_app/` at one of Connect's own paths (`/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings`, the catch-all `$`) overrides it. Any other route at those URLs fails the build. To keep Connect's loader and search params, spread its `options`, exported from `@powerhousedao/connect/routes/...`, and set your own `component`.
- Files and folders starting with `-` are not routes. Use them for shared components.
- Each route is code-split into its own chunk.
- `@tanstack/react-router` must match the version in `@powerhousedao/connect`'s `package.json`.

## Requirements

Project routes shipped with `@powerhousedao/connect-core` (powerhouse PR #3254), which no release includes yet. The workspace catalog's 6.2.3-dev.25 predates it, so this recipe pins `@powerhousedao/connect`, `@powerhousedao/reactor-browser` and `@powerhousedao/ph-cli` to 6.2.3-dev.69 instead of `catalog:`. The three must stay on the same version: `ph-cli` generates the route tree, and the `reactor-browser` helpers the routes import first appear on this line.

## Running

```sh
pnpm install
pnpm --filter @powerhousedao/example-connect-routes studio
```

Open `/inventory`, `/settings/inventory` and `/status`.
