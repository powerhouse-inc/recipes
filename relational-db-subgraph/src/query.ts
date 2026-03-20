import type { Kysely } from "kysely";
import type { CatalogDB } from "./schema.js";

export interface DocumentResult {
  document_id: string;
  document_type: string;
  name: string;
  content_summary: string;
  revision: number;
  updated_at: Date;
  tags: string[];
}

async function attachTags(
  db: Kysely<CatalogDB>,
  rows: Omit<DocumentResult, "tags">[],
): Promise<DocumentResult[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.document_id);
  const tagRows = await db
    .selectFrom("document_tags")
    .select(["document_id", "tag"])
    .where("document_id", "in", ids)
    .execute();

  const tagMap = new Map<string, string[]>();
  for (const { document_id, tag } of tagRows) {
    const arr = tagMap.get(document_id);
    if (arr) arr.push(tag);
    else tagMap.set(document_id, [tag]);
  }

  return rows.map((row) => ({
    ...row,
    tags: tagMap.get(row.document_id) ?? [],
  }));
}

export function createCatalogQuery(db: Kysely<CatalogDB>) {
  return {
    async allDocuments(
      limit = 50,
      offset = 0,
    ): Promise<DocumentResult[]> {
      const rows = await db
        .selectFrom("documents")
        .selectAll()
        .orderBy("updated_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
      return attachTags(db, rows);
    },

    async documentById(id: string): Promise<DocumentResult | undefined> {
      const row = await db
        .selectFrom("documents")
        .selectAll()
        .where("document_id", "=", id)
        .executeTakeFirst();
      if (!row) return undefined;
      const [result] = await attachTags(db, [row]);
      return result;
    },

    async documentsByType(
      documentType: string,
      limit = 50,
      offset = 0,
    ): Promise<DocumentResult[]> {
      const rows = await db
        .selectFrom("documents")
        .selectAll()
        .where("document_type", "=", documentType)
        .orderBy("updated_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
      return attachTags(db, rows);
    },

    async documentsByTag(
      tag: string,
      limit = 50,
      offset = 0,
    ): Promise<DocumentResult[]> {
      const rows = await db
        .selectFrom("documents")
        .innerJoin(
          "document_tags",
          "documents.document_id",
          "document_tags.document_id",
        )
        .where("document_tags.tag", "=", tag)
        .select([
          "documents.document_id",
          "documents.document_type",
          "documents.name",
          "documents.content_summary",
          "documents.revision",
          "documents.updated_at",
        ])
        .orderBy("documents.updated_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
      return attachTags(db, rows);
    },
  };
}
