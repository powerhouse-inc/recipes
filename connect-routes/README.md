# Connect Routes

Adding pages to Connect (the Powerhouse web app) from a project, with TanStack Router file routes in `hosts/connect/routes/`. No Connect code is forked: Connect reads the folder, generates the route tree into `.ph/connect-routes.gen.ts`, and mounts the routes beside its own.

## What it demonstrates

- `_app/inventory.tsx` renders inside Connect's layout at `/inventory`. `staticData.nav` lists it in the sidebar, after the drives, ordered by `order`.
- Its `loader` reads Connect's store from the router context (`context.store.drives`). On a cold load the drives are still arriving, so `-drives.ts` waits on `context.arrivals` first. Its `head` sets the page title with the app name from `match.context.appName`.
- `_app/settings/inventory.tsx` adds a tab to `/settings` through `staticData.settings`. `enabled` hides the tab, and redirects its URL to the first tab, while it returns false. Connect reads it once, when it builds the tab list, so it must not depend on state that arrives later. Here it returns `import.meta.env.DEV`: the tab shows in studio and is hidden in a production build.
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

## Tests

```sh
pnpm --filter @powerhousedao/example-connect-routes test
```

- `test/routes.test.ts` (vitest) runs `ph-cli build` and reads the route tree it writes to `.ph/`. It checks that each route file has the parent this README names: `/status` under the root, `/_app/inventory` under `/_app`, and `/_app/settings/inventory` under `/_app/settings`.
- `test/e2e/` (Playwright) starts `ph-cli connect studio` on port 4199 and checks the pages in Chromium. `/status` has no sidebar, `/inventory` has a sidebar link and its own title, and the settings tab shows. After it creates a drive, the loaders list it. `test:e2e` installs Chromium first.
- Studio is a dev server, so `enabled` returns true and the tests cover the shown tab only, not the redirect a production build makes.
