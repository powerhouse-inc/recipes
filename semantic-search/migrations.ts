import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // PGlite ships pgvector as an opt-in extension: pass it to the PGlite
  // constructor (see demo.ts), then activate it per database here.
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await db.schema
    .createTable("semantic_index")
    .addColumn("document_id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("content", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("content_hash", "varchar(64)", (col) => col.notNull())
    .addColumn("embedding", sql`vector(384)`, (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .ifNotExists()
    .execute();

  // HNSW defaults (m=16, ef_construction=64) are more than enough at demo
  // scale; tune them only when the table holds many thousands of vectors.
  await sql`CREATE INDEX IF NOT EXISTS idx_semantic_embedding_hnsw
    ON semantic_index USING hnsw (embedding vector_cosine_ops)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_semantic_embedding_hnsw").ifExists().execute();
  await db.schema.dropTable("semantic_index").ifExists().execute();
}
