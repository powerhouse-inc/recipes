# Semantic Search Processor

A Reactor `IProcessor` that embeds document content with an in-process model (Transformers.js) into PGlite's `vector` extension and answers cosine-similarity queries — the semantic sibling of the [full-text-search](../full-text-search) recipe. No external API, no API key, no server: the `all-MiniLM-L6-v2` model runs in-process via ONNX, and pgvector runs inside PGlite.

## How it works

When operations arrive, the processor:

1. Collects the last operation per document (earlier states are superseded).
2. Flattens the resulting document state into a single string (same extraction as full-text-search) and truncates it to the model's effective window.
3. Hashes the text and **skips re-embedding when the hash is unchanged** — embedding is by far the most expensive step.
4. Embeds the text into a 384-dimensional vector and upserts it into `semantic_index` (`embedding vector(384)`, HNSW index, cosine ops).
5. Handles `DELETE_DOCUMENT` actions by removing the corresponding row.

Queries go through `searchSimilar(text, k)`: embed the query with the same model, then `ORDER BY embedding <=> $1 LIMIT k`. With normalized embeddings, `similarity = 1 - cosine distance`.

## Architecture

| Module | Purpose |
|--------|---------|
| `processor.ts` | `SemanticSearchProcessor` — the `IProcessor` implementation |
| `embedder.ts` | Real embedder: Transformers.js feature-extraction pipeline, lazily initialized once |
| `schema.ts` | Kysely type definitions for the `semantic_index` table |
| `migrations.ts` | `up` / `down`: `CREATE EXTENSION vector`, the table, and the HNSW index |
| `query.ts` | `createSimilarityQuery` — returns a `searchSimilar(text, k?)` helper |
| `utils.ts` | Text flattening, truncation, content hashing, vector literals, dimension guard |

## Run it

```sh
pnpm start   # runs demo.ts
pnpm test    # offline — uses a deterministic fake embedder
```

The demo builds a reactor, registers the processor, creates ten documents on distinct topics, then runs semantic queries side by side with lexical full-text search over the same content. Queries like *"my car needs an oil change"* find *"Automobile Maintenance and Repair Manual"* — a hit lexical search misses because query and document share no words.

**First-run model download:** `demo.ts` downloads ~25 MB (quantized MiniLM) from the HuggingFace Hub into `.model-cache/` next to the sources; later runs are fully offline. Tests never download anything — they inject a fake embedder (word-hash → pseudo-vector) so similarity ordering and processor mechanics are testable in CI.

## Usage

```ts
import {
  up,
  embed,
  SemanticSearchProcessor,
  createSimilarityQuery,
} from "@powerhousedao/example-semantic-search";
import { KyselyPGlite } from "kysely-pglite";
import { vector } from "@electric-sql/pglite/vector";
import { Kysely } from "kysely";

// PGlite must be constructed with the vector extension
const pglite = new KyselyPGlite({ extensions: { vector } });
const db = new Kysely<SemanticSearchDB>({ dialect: pglite.dialect });
await up(db);

const processor = new SemanticSearchProcessor(db, embed);
// ...register with a ProcessorManager...

const query = createSimilarityQuery(db, embed);
const results = await query.searchSimilar("budget allocation", 10);
// [{ document_id, document_type, title, similarity }]
```

## Notes & pitfalls

- **The embedding dimension is baked into the column type.** `vector(384)` matches `all-MiniLM-L6-v2`; the processor asserts `embedding.length === 384` before insert, so swapping models with a different dimension fails loudly instead of corrupting the index.
- **Long content is truncated**, not chunked. MiniLM attends to ~256 tokens; `utils.ts` cuts at 2 000 characters and stores exactly what was embedded. Production systems should chunk long content into multiple rows.
- **HNSW parameters don't matter at demo scale.** The defaults (`m=16`, `ef_construction=64`) are fine until the table holds many thousands of vectors.
- **Plain vs. lazy imports.** [`@powerhousedao/knowledge-note`](https://www.npmjs.com/package/@powerhousedao/knowledge-note) — the production proof of this stack — lazily `import()`s PGlite so its processor and subgraph still register on deployments where transitive runtime deps aren't installed. In a Node-only recipe a plain import is simpler; only the model pipeline is lazily initialized.

## Related recipes

- [full-text-search](../full-text-search) — the lexical sibling; same layout, same text extraction, so the two approaches diff cleanly.
- [relational-db-subgraph](../relational-db-subgraph) — how to expose a read model like this one over GraphQL.
