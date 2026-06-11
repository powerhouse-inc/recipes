import { sql, type Kysely } from "kysely";
import type { SemanticSearchDB } from "./schema.js";
import { assertEmbeddingDim, toVectorLiteral, type EmbedFn } from "./utils.js";

export interface SimilarityResult {
  document_id: string;
  document_type: string;
  title: string;
  similarity: number;
}

export function createSimilarityQuery(
  db: Kysely<SemanticSearchDB>,
  embed: EmbedFn,
) {
  return {
    async searchSimilar(text: string, k = 10): Promise<SimilarityResult[]> {
      const embedding = await embed(text);
      assertEmbeddingDim(embedding);
      const vec = toVectorLiteral(embedding);

      // <=> is pgvector's cosine-distance operator; with normalized
      // embeddings, similarity = 1 - distance.
      const result = await sql<SimilarityResult>`
        SELECT
          document_id,
          document_type,
          title,
          1 - (embedding <=> ${vec}::vector) AS similarity
        FROM semantic_index
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${k}
      `.execute(db);
      return result.rows;
    },
  };
}
