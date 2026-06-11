import { createHash } from "node:crypto";

/**
 * Dimension of the all-MiniLM-L6-v2 embedding space. It is baked into the
 * `vector(384)` column type, so every embedder (real or fake) must match it.
 */
export const EMBEDDING_DIM = 384;

/**
 * Any async text → vector function. The real Transformers.js implementation
 * lives in embedder.ts; tests inject a deterministic offline fake.
 */
export type EmbedFn = (text: string) => Promise<number[]>;

/**
 * MiniLM attends to ~256 tokens; anything past that is ignored by the model,
 * so we truncate up front and store exactly what was embedded. Chunking long
 * content into multiple rows would be the production approach.
 */
export const MAX_EMBED_CHARS = 2_000;

export function truncateForEmbedding(text: string): string {
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** pgvector accepts vectors as '[1,2,3]' literals cast with ::vector. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function assertEmbeddingDim(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Expected ${EMBEDDING_DIM}-dimensional embedding, got ${embedding.length}`,
    );
  }
}

/**
 * Recursively walks a JSON value and collects all string values into a single
 * space-separated string — same extraction as the full-text-search recipe, so
 * both indexes see identical text.
 */
export function flattenToSearchableText(state: unknown): string {
  const parts: string[] = [];
  collect(state, parts);
  return parts.join(" ");
}

function collect(value: unknown, parts: string[]): void {
  if (value == null) return;

  if (typeof value === "string") {
    if (value.length > 0) {
      parts.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, parts);
    }
    return;
  }

  if (typeof value === "object") {
    for (const v of Object.values(value)) {
      collect(v, parts);
    }
  }
}
