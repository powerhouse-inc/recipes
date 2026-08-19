# Recipe briefs

Design briefs for future recipes, distilled from a survey of all 43 packages published
to the Powerhouse registry (June 2026). Each brief is self-contained: what the recipe
demonstrates, which real-world packages prove the pattern, concrete file references,
a suggested shape, and known pitfalls.

## Reference material

All package references point into the registry-audit cache:

```
~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/<package>/
```

These are extracted npm tarballs (compiled `dist/` output: readable JS plus `.d.ts`
and `powerhouse.manifest.json`). If the cache has been cleared, regenerate it from the
monorepo:

```sh
cd ~/projects/powerhouse/powerhouse
pnpm audit:download && pnpm audit:extract   # tools/registry-audit
```

## Repo conventions a new recipe should follow

- Standalone package named `@powerhousedao/example-<name>`, `"private": true`, AGPL-3.0-only.
- Powerhouse deps via `catalog:` (see root `pnpm-workspace.yaml`). A single catalog
  tracks the `6.2.0-dev` line. The `document-drive` package is dead. The drive
  document model lives at `@powerhousedao/shared/document-drive`.
- Flat files or `src/`, a runnable `demo.ts` (`pnpm start` via tsx), vitest tests, a README.
- Register the new directory in `pnpm-workspace.yaml` `packages:` and add a row to the
  root `README.md` table.

## The briefs

| # | Brief | One-liner |
|---|-------|-----------|
| 1 | [document-versioning](./01-document-versioning.md) | v1→v2 document model schema migration with `UpgradeManifest` and pure upgrade reducers |
| 2 | [analytics-processor](./02-analytics-processor.md) | Feed operations into the Powerhouse analytics engine and query time-series back |
| 3 | [semantic-search](./03-semantic-search.md) | Embeddings-based similarity search via a processor writing to PGlite + pgvector |
| 4 | [inbound-webhook-bridge](./04-inbound-webhook-bridge.md) | Subgraph receives signed external webhooks and dispatches them as document actions |
| 5 | [external-feed-ingest](./05-external-feed-ingest.md) | Polling processor ingests an external feed into documents idempotently |
| 6 | [async-job-controller](./06-async-job-controller.md) | Processor runs an external side effect on approval and writes completion back into the document |
| 7 | [drive-provisioner](./07-drive-provisioner.md) | One subgraph mutation provisions a drive, folder tree, and pre-filled documents |
| 8 | [llm-extraction](./08-llm-extraction.md) | Claude turns unstructured input into structured document operations with confidence scores |
| 9 | [ai-suggestions](./09-ai-suggestions.md) | Agent suggestions as first-class document state with human accept/dismiss resolution |
| 10 | [derived-invariants](./10-derived-invariants.md) | Reducers recompute rollups after every mutation and auto-advance status at thresholds |
| 11 | [phd-import](./11-phd-import.md) | CLI imports a `.phd` archive into a remote reactor by replaying its operations |
| 12 | [deletion-aware-read-model](./12-deletion-aware-read-model.md) | Relational read model that handles document deletion via a sentinel table |
