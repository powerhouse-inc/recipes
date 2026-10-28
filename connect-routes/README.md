# Connect Routes

Adding pages to Connect (the Powerhouse web app) from a project, with TanStack Router file routes in `hosts/connect/routes/`. No Connect code is forked: Connect reads the folder, generates the route tree into `.ph/connect-routes.gen.ts`, and mounts the routes beside its own.

## What it demonstrates

- `_app/inventory.tsx` renders inside Connect's layout at `/inventory`. `staticData.nav` lists it in the sidebar, after the drives, ordered by `order`.
- Its `loader` reads Connect's store from the router context (`context.store.drives`). On a cold load the drives are still arriving, so `-drives.ts` waits until `context.arrivals` has nothing pending. A loader runs once per navigation, so the page shows the drives as they were when it opened. To follow drives that change while the page is open, read them in the component with `useDrives()` from `@powerhousedao/reactor-browser`. Its `head` sets the page title with the app name from `match.context.appName`.
- `_app/settings/inventory.tsx` adds a tab to `/settings` through `staticData.settings`. `enabled` hides the tab, and redirects its URL to the first tab, while it returns false. Connect reads it once, when it builds the tab list, so it must not depend on state that arrives later. Here it returns `import.meta.env.DEV`: the tab shows in studio and is hidden in a production build.
- `status.tsx` sits outside `_app/`, so `/status` is a full page without the sidebar.

## Rules

- Connect reads routes only from `hosts/connect/routes/`.
- A file in `_app/` at one of Connect's own paths (`/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings`, the catch-all `$`) overrides it. Any other route at those URLs fails the build. To keep Connect's loader and search params, spread its `options`, exported from `@powerhousedao/connect/routes/...`, and set your own `component`.
- Files and folders starting with `-` are not routes. Use them for shared components.
- Each route is code-split into its own chunk.
- `@tanstack/react-router` must match the version in `@powerhousedao/connect`'s `package.json`.

## Generating the route tree without a build

`ph-cli generate connect-routes` writes `.ph/connect-routes.gen.ts`, the tree that `hosts/connect/routes/` type-checks against, and drops a stale one. `ph-cli build` runs the same step, so the command is for checking types (`tsc`, an editor) in a fresh checkout before any build. It does nothing in a project with no routes. Run it as `pnpm exec ph-cli generate connect-routes`. Under `ph vetra --watch` the tree is kept up to date for you.

It first ships in the release that includes powerhouse PR #3293, after the 6.2.3-dev.77 the catalog pins. Bump the catalog before running it.

## Requirements

Project routes shipped with `@powerhousedao/connect-core` (powerhouse PR #3254), first released in 6.2.3-dev.69. The recipe takes `@powerhousedao/connect`, `@powerhousedao/reactor-browser`, `@powerhousedao/ph-cli`, `@powerhousedao/design-system` and `document-model` from the workspace catalog, so they stay on one version: `ph-cli` generates the route tree, and the `reactor-browser` helpers the routes import first appear on this line.

The catalog pins 6.2.3-dev.78. 6.2.3-dev.71 is the first release in which Connect's studio starts in a project that installs it from npm (powerhouse PRs #3265 and #3266) and connect-core ships its route files compiled (#3268). Connect 6.2.3-dev.70 and earlier do not start in an installed project, so `studio` and the Playwright tests need 6.2.3-dev.71 or later.

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
- `test/e2e/` (Playwright) starts `ph-cli connect studio` on port 4199 and checks the pages in Chromium. `/status` has no sidebar, `/inventory` has a sidebar link and its own title, and the settings tab shows. After it creates a drive, the loaders list it. `test:e2e` installs Chromium first, but not the system libraries it needs on Linux. GitHub's Ubuntu runners already have them. On a bare Linux machine, run `pnpm exec playwright install-deps chromium` once (it uses `sudo`).
- Studio is a dev server, so `enabled` returns true and the tests cover the shown tab only, not the hidden tab and the redirect of a production build. Checking those would take a production Connect build and a server for it, which would add minutes to every run.
