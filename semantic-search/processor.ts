import type { OperationWithContext } from "document-model";
import type { IProcessor } from "@powerhousedao/reactor";
import { sql, type Kysely } from "kysely";
import type { SemanticSearchDB } from "./schema.js";
import {
  assertEmbeddingDim,
  contentHash,
  flattenToSearchableText,
  toVectorLiteral,
  truncateForEmbedding,
  type EmbedFn,
} from "./utils.js";

export class SemanticSearchProcessor implements IProcessor {
  constructor(
    private readonly db: Kysely<SemanticSearchDB>,
    private readonly embed: EmbedFn,
  ) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return;

    // Collect the last operation per documentId (earlier states are superseded)
    const lastByDocument = new Map<string, OperationWithContext>();

    for (const entry of operations) {
      const { operation, context } = entry;

      if (operation.action.type === "DELETE_DOCUMENT") {
        const input = operation.action.input as {
          documentId?: string;
        };
        const deletedId = input.documentId ?? context.documentId;
        await this.db
          .deleteFrom("semantic_index")
          .where("document_id", "=", deletedId)
          .execute();
        lastByDocument.delete(deletedId);
        continue;
      }

      if (!context.resultingState) continue;
      lastByDocument.set(context.documentId, entry);
    }

    for (const [documentId, { context }] of lastByDocument) {
      const state = JSON.parse(context.resultingState!) as Record<
        string,
        unknown
      >;
      const header = state.header as Record<string, unknown> | undefined;
      const title = typeof header?.name === "string" ? header.name : "";
      const content = truncateForEmbedding(flattenToSearchableText(state));
      const hash = contentHash(content);

      // Embedding is by far the most expensive step — skip it when the
      // embeddable text is byte-identical to what is already indexed.
      const existing = await this.db
        .selectFrom("semantic_index")
        .select("content_hash")
        .where("document_id", "=", documentId)
        .executeTakeFirst();
      if (existing?.content_hash === hash) continue;

      const embedding = await this.embed(content);
      assertEmbeddingDim(embedding);

      await sql`
        INSERT INTO semantic_index
          (document_id, document_type, title, content, content_hash, embedding, updated_at)
        VALUES (
          ${documentId},
          ${context.documentType},
          ${title},
          ${content},
          ${hash},
          ${toVectorLiteral(embedding)}::vector,
          NOW()
        )
        ON CONFLICT (document_id) DO UPDATE SET
          document_type = EXCLUDED.document_type,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `.execute(this.db);
    }
  }

  async onDisconnect(): Promise<void> {}
}
