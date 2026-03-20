import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("documents")
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("content_summary", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("revision", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .ifNotExists()
    .execute();

  await sql`CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (document_type)`.execute(
    db,
  );

  await db.schema
    .createTable("document_tags")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("tag", "varchar(255)", (col) => col.notNull())
    .ifNotExists()
    .execute();

  await sql`CREATE INDEX IF NOT EXISTS idx_document_tags_document ON document_tags (document_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags (tag)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tags_unique ON document_tags (document_id, tag)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_document_tags_unique").ifExists().execute();
  await db.schema.dropIndex("idx_document_tags_tag").ifExists().execute();
  await db.schema.dropIndex("idx_document_tags_document").ifExists().execute();
  await db.schema.dropTable("document_tags").ifExists().execute();
  await db.schema.dropIndex("idx_documents_type").ifExists().execute();
  await db.schema.dropTable("documents").ifExists().execute();
}
