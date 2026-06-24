# Recipe brief: phd-import

**One-liner:** A CLI that imports a `.phd` archive into a remote reactor — create the
document over GraphQL, replay the archived operations in order, and verify the final
state matches. The missing import half of `document-snapshot-exporter`.

## Why this recipe

`document-snapshot-exporter` covers getting state *out*; nothing covers getting a
document *in* — seeding demo data, migrating a document between reactors, restoring
from a snapshot. `vetra-builder-package` ships a production script that does exactly
this (`upload-to-drive.ts`), and `network-admin` ships a second variant
(state-diff mirroring over MCP) that's worth referencing as the alternative strategy.

## What it demonstrates

- The `.phd` archive format: a ZIP containing `header.json` and `operations.json`
  (per scope).
- Creating a remote document via GraphQL mutation, then replaying stored operations
  against it in order.
- Batching action submission (the wild scripts cap at ~50 actions per call).
- Verifying the import: re-read remote state and compare against the locally replayed
  archive.

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__vetra-builder-package`** — the direct blueprint.
  - `dist/scripts/upload-to-drive.js` — verified: reads a `.phd` ZIP, extracts
    `header.json` + `operations.json`, creates the remote document
    (`createDocument` mutation), then replays each stored operation through its typed
    GraphQL mutation (`BuilderTeam_setTeamName`, `BuilderTeam_addMember`, ...).
    Note its choice: *typed per-operation mutations*, which requires the document
    model's generated mutations to exist on the target Switchboard.
- **`@powerhousedao__network-admin`** — the alternative strategy.
  - `dist/scripts/sow-mirror/mirror_sow_state.js` — connects to two Reactor MCP
    endpoints, diffs document state between them, and submits batched actions
    (≤50 per `addActions` call) to converge the target. Diff-based rather than
    log-replay-based; good "see also" for incremental sync rather than one-shot import.

## Suggested shape

Standalone package `@powerhousedao/example-phd-import`, CLI-style like
`subscription-cli` / `document-snapshot-exporter`.

- `cli.ts` — `phd-import <file.phd> --url <reactor> --drive <driveId> [--verify]`.
- `archive.ts` — parse the ZIP (`header.json` → documentType/id/meta;
  `operations.json` → ordered ops per scope). Generate fixtures by exporting from a
  local reactor (ideally reuse/extend `document-snapshot-exporter` so the pair
  round-trips, which is also the best demo).
- `import.ts` — two strategies, pick one as primary:
  1. **Generic replay** (recommended for a recipe): submit archived operations/actions
     through the generic mutation surface (`addActions`-style), batched ≤50 — works
     for any document type without generated mutations.
  2. **Typed replay** (vetra-builder's way): map operation types to generated
     per-model mutations — document it, link the reference, don't build it.
- `verify.ts` — fetch final remote state, deep-compare with local replay of the
  archive; print a diff on mismatch.
- `demo.ts` — full round trip against a local reactor: create + mutate a doc → export
  to `.phd` → import into a second drive (or second reactor instance) → verify.
- Tests: archive parsing, batching boundaries (51 ops → 2 calls), ordering preserved,
  verify catches a corrupted archive.

## Implementation notes & pitfalls

- **Scopes and ordering**: `operations.json` carries per-scope logs (global/local);
  replay must preserve per-scope order. Skip ops the server generates itself on
  creation (the initial CREATE/document-genesis op) — detect by index 0/type rather
  than blindly replaying.
- **Identity**: importing under a fresh document id avoids collisions but breaks
  cross-document PHID references; `--preserve-id` should exist but must handle
  "already exists" (fail, or hand off to the diff/mirror strategy).
- Signatures don't transfer: archived operations signed by original signers can't be
  re-signed by the importer — the imported history is a *re-authored* copy. Call this
  out and cross-link `signed-operations-verifier`.
- Batch size limits exist in the wild for a reason (~50 in network-admin); make it a
  flag with that default.
- Read-after-write verification needs consistency handling — reuse the
  `document-snapshot-exporter` consistency-token technique.

## Related recipes in this repo

- `document-snapshot-exporter` — the export half; aim for a documented round trip.
- `db-migrate` — whole-database migration; this is the per-document alternative.
- `signed-operations-verifier` — why imported histories lose original signatures.
- `subscription-cli` — CLI structure precedent.
