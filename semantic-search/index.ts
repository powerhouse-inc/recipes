export { SemanticSearchProcessor } from "./processor.js";
export { createSimilarityQuery } from "./query.js";
export type { SimilarityResult } from "./query.js";
export type { SemanticSearchDB, SemanticIndex } from "./schema.js";
export { embed } from "./embedder.js";
export {
  EMBEDDING_DIM,
  MAX_EMBED_CHARS,
  assertEmbeddingDim,
  contentHash,
  flattenToSearchableText,
  toVectorLiteral,
  truncateForEmbedding,
} from "./utils.js";
export type { EmbedFn } from "./utils.js";
export { up, down } from "./migrations.js";
