import type { OperationWithContext } from "document-model";
import {
  RelationalDbProcessor,
  type IRelationalDb,
  type ProcessorFilter,
} from "@powerhousedao/reactor";
import { sql } from "kysely";
import type { CatalogDB } from "./schema.js";
import { up } from "./migrations.js";

/**
 * Extracts tags from a document state object.
 * Looks for common "tags" or "labels" array fields on the state.
 */
function extractTags(state: Record<string, unknown>): string[] {
  const raw = state.tags ?? state.labels;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}

/**
 * A document-type-agnostic processor that maintains a relational catalog
 * of all documents flowing through the Reactor.
 *
 * Extends {@link RelationalDbProcessor} to get namespaced DB access,
 * migration management via `initAndUpgrade()`, and a type-safe
 * `query` builder for read operations.
 *
 * This is the pattern produced by `ph generate --processor` for
 * relational DB processors.
 */
export class CatalogProcessor extends RelationalDbProcessor<CatalogDB> {
  async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return;

    const lastByDocument = new Map<string, OperationWithContext>();

    for (const entry of operations) {
      const { operation, context } = entry;

      if (operation.action.type === "DELETE_DOCUMENT") {
        const input = operation.action.input as { documentId?: string };
        const deletedId = input.documentId ?? context.documentId;

        await this.relationalDb
          .deleteFrom("document_tags")
          .where("document_id", "=", deletedId)
          .execute();
        await this.relationalDb
          .deleteFrom("documents")
          .where("document_id", "=", deletedId)
          .execute();

        lastByDocument.delete(deletedId);
        continue;
      }

      if (!context.resultingState) continue;
      lastByDocument.set(context.documentId, entry);
    }

    for (const [documentId, { operation, context }] of lastByDocument) {
      const state = JSON.parse(context.resultingState!) as Record<
        string,
        unknown
      >;
      const name = typeof state.name === "string" ? state.name : "";
      const contentSummary =
        typeof state.description === "string"
          ? state.description.slice(0, 500)
          : "";

      await sql`
        INSERT INTO documents (document_id, document_type, name, content_summary, revision, updated_at)
        VALUES (
          ${documentId},
          ${context.documentType},
          ${name},
          ${contentSummary},
          ${operation.index},
          NOW()
        )
        ON CONFLICT (document_id) DO UPDATE SET
          document_type = EXCLUDED.document_type,
          name = EXCLUDED.name,
          content_summary = EXCLUDED.content_summary,
          revision = EXCLUDED.revision,
          updated_at = NOW()
      `.execute(this.relationalDb);

      // Sync tags: delete existing, re-insert current set
      const tags = extractTags(state);
      await this.relationalDb
        .deleteFrom("document_tags")
        .where("document_id", "=", documentId)
        .execute();

      if (tags.length > 0) {
        await this.relationalDb
          .insertInto("document_tags")
          .values(tags.map((tag) => ({ document_id: documentId, tag })))
          .execute();
      }
    }
  }

  async onDisconnect(): Promise<void> {}
}

/**
 * Creates a {@link CatalogProcessor} for a given drive.
 *
 * This follows the pattern produced by `ph generate --processor`:
 * a factory function that accepts a relational DB and filter,
 * then returns a configured processor instance.
 *
 * @example
 * ```ts
 * import { createRelationalDb } from "@powerhousedao/reactor";
 * import { Kysely } from "kysely";
 *
 * const db = createRelationalDb(new Kysely({ dialect }));
 * const processor = createCatalogProcessor(db, { branch: ["main"] });
 * await processor.initAndUpgrade();
 * ```
 */
export function createCatalogProcessor(
  relationalDb: IRelationalDb<CatalogDB>,
  filter: ProcessorFilter,
): CatalogProcessor {
  return new CatalogProcessor("catalog", filter, relationalDb);
}
