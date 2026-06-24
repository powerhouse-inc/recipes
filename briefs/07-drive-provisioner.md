# Recipe brief: drive-provisioner

**One-liner:** One server-side mutation that provisions a complete workspace — creates
a new drive, builds a folder tree, creates documents pre-filled from a template, stamps
the drive's preferred editor, and returns a deep link.

## Why this recipe

Self-service onboarding is a killer flow: `rfp-hub-app`'s `applyToPool` mutation gives
every grant applicant their own pre-structured drive in a single GraphQL call. The
pattern exercises drive- and node-creation APIs that no recipe currently touches, plus
the ordering/consistency subtleties of creating a drive and immediately writing into it.

## What it demonstrates

- Creating a drive programmatically from server-side code (`reactor.create` /
  `addDrive` path).
- Adding folder nodes and document nodes to the new drive.
- Dispatching prefill operations into freshly created documents using the document
  model's action creators.
- Setting drive metadata — `header.meta.preferredEditor` — so Connect opens the right
  app for that drive automatically.
- Returning a shareable deep-link URL assembled from environment config.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`rfp-hub-app`** — the whole pattern in one resolver.
  - `dist/browser/apply-to-of3FkzIu.js` (~lines 521–600) — verified symbols:
    `applyToPool`, `reactor.create`, `addFolder`, `preferredEditor`. Flow: create
    applicant drive → add folders → add `project` + `grant-application` documents →
    dispatch prefill ops derived from the grant pool's data → stamp
    `driveDoc.header.meta.preferredEditor = "applicant-workspace"` → return a Connect
    deep link.
  - Same file — `getConnectUrl()` / `getSwitchboardBaseUrl()`: env-fallback URL
    resolution (env var → `NEXT_PUBLIC_*` alias → hardcoded default) for building the
    returned link; bundles `dotenv` for production.
  - `dist/browser/editor-Qry5wCbf.js` — the consuming side: the `funder-back-office`
    drive app aggregating all provisioned documents (kanban by `reviewStage`,
    activity feed). Out of scope to build, useful to understand why provisioning
    stamps `preferredEditor`.

## Suggested shape

Standalone package `@powerhousedao/example-drive-provisioner`.

- A workspace template definition: folder names + a couple of document specs with
  prefill values (keep the document type trivial — a generic "notes"/"todo" doc or a
  hand-rolled model as other recipes do).
- `provision.ts` — `provisionWorkspace(reactor, { name, template }) → { driveId,
  documentIds, url }`:
  1. create drive,
  2. create folders,
  3. create documents under the right folders,
  4. dispatch prefill actions,
  5. set `preferredEditor` meta,
  6. assemble deep link from a base URL.
- Expose it both as a plain function (so `demo.ts` can call it directly) and wired as
  a subgraph mutation if the repo's subgraph harness makes that cheap (see
  `relational-db-subgraph` for the wiring).
- `demo.ts` — provision two workspaces from the same template, print the resulting
  drive trees and the deep links.
- Tests: structure matches template; provisioning is repeatable (unique slugs/ids, no
  collision); prefilled state present on read-back.

## Implementation notes & pitfalls

- **Ordering and read-after-write.** The drive must exist before nodes are added, and
  documents before prefill ops. If reads follow immediately, use consistency tokens —
  the `document-snapshot-exporter` recipe already demonstrates `IReactor` consistency
  tokens; reuse that technique rather than sleeping.
- Name collisions: derive a slug + random suffix for the drive name, or make the
  mutation idempotent by checking for an existing workspace key first.
- Deep-link format differs per deployment (local Connect vs. hosted); copy rfp-hub's
  env-fallback helper shape and document the env vars in the README.
- Decide whether the new drive is local-only or should register a remote/sync target;
  keep the recipe local-reactor-only and note the production difference.
- Keep template data in one obvious `template.ts` so readers see what to customize.

## Related recipes in this repo

- `batch-progress` — bulk document creation mechanics + progress events.
- `document-snapshot-exporter` — consistency tokens for read-after-write.
- `drive-override` — alternate take on container documents; contrast in README.
