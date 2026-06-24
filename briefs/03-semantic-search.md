# Recipe brief: semantic-search

**One-liner:** A processor that embeds document content with an in-process model
(Transformers.js) into PGlite's `vector` extension and answers cosine-similarity
queries — the semantic sibling of the existing `full-text-search` recipe.

## Why this recipe

`full-text-search` covers lexical search; semantic similarity is the natural
companion, and `@powerhousedao/knowledge-note` proves the whole stack runs in-process
on the Powerhouse platform: HuggingFace Transformers.js generating 384-dim embeddings,
stored in PGlite with a pgvector HNSW index, queried by cosine distance — no external
API, no API key, no server.

## What it demonstrates

- Generating embeddings inside a processor with `@huggingface/transformers`
  (e.g. `all-MiniLM-L6-v2`, 384 dimensions, WASM/ONNX — runs in Node and browser).
- PGlite with the `vector` extension: `CREATE TABLE ... embedding vector(384)`,
  HNSW index, `<=>` cosine-distance ordering.
- A `searchSimilar(text, k)` query function that embeds the query and does
  nearest-neighbour lookup.
- Skipping re-embeds when content is unchanged (content hashing).

## Reference packages

Cache root: `~/projects/powerhouse/powerhouse/.cache/registry-audit/extracted/`

- **`@powerhousedao__knowledge-note`** — the production proof.
  - `dist/browser/graph-indexer-DWRp6Ohc.js` — the GraphIndexer processor (verified
    symbols: `vector(384)`, `hnsw`, `searchSimilar`). Around lines 40–98: lazy
    `import('@electric-sql/pglite')` on first use (so module registration works even
    where PGlite isn't installed), embedding pipeline setup, vector table creation
    with HNSW index. Around lines 188–201: bonus pattern — recording
    `signer_address` / `signer_app` from `operation.action.context?.signer` into an
    operations table.
  - `package.json` — dependency set: `@huggingface/transformers`,
    `@electric-sql/pglite`, plus graph-viz extras (pixi.js, cytoscape) that the recipe
    should *not* copy.
  - `dist/powerhouse.manifest.json` — how the processor + `KnowledgeGraphSubgraph`
    are declared.

## Suggested shape

Standalone package `@powerhousedao/example-semantic-search`, mirroring the
`full-text-search` recipe's flat layout (`schema.ts`, `migrations.ts`, `processor.ts`,
`query.ts`, `demo.ts`, `processor.test.ts`) so the two recipes read as a pair.

- `migrations.ts` — `documents` table with `embedding vector(384)` + HNSW index
  (PGlite `vector` extension; `kysely-pglite` is already used by `full-text-search`,
  raw SQL for the vector DDL is fine).
- `embedder.ts` — wraps the Transformers.js feature-extraction pipeline; exports
  `embed(text): Promise<number[]>`; model is lazily initialized once.
- `processor.ts` — on document ops, extract title+content text, hash it, skip if
  unchanged, else embed and upsert.
- `query.ts` — `searchSimilar(text, k)`: embed query, `ORDER BY embedding <=> $1
  LIMIT k`, return docs with similarity scores.
- `demo.ts` — seed ~10 short documents on distinct topics, run 2–3 queries showing
  semantically related hits that lexical search would miss (e.g. "car" matching
  "automobile maintenance"). Bonus: same query through the `full-text-search` approach
  side by side.
- Tests: similarity ordering sanity (related > unrelated), unchanged-content skip,
  dimension mismatch guard.

## Implementation notes & pitfalls

- **First-run model download** (~25 MB for MiniLM): cache to a local dir, document it
  in the README. For tests, either mark integration tests accordingly or inject a
  deterministic fake embedder (hash → pseudo-vector) so CI stays offline; keep the
  real model path for `demo.ts`.
- Embedding dimension is baked into the column type — assert
  `embedding.length === 384` before insert.
- Long content needs chunking or truncation (MiniLM ~256 tokens); for the recipe,
  truncate and say so.
- HNSW index params matter little at demo scale; mention `m`/`ef_construction`
  defaults and move on.
- Keep knowledge-note's lazy-import trick if module load-time cost matters; in a
  Node-only recipe a plain import is fine — note the difference.

## Related recipes in this repo

- `full-text-search` — the lexical sibling; share layout and demo corpus so readers
  can diff the two approaches.
- `relational-db-subgraph` — exposing the search as GraphQL if the recipe grows a
  subgraph.
