import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("saga_log")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("saga_id", "varchar(255)", (col) => col.notNull())
    .addColumn("step_name", "varchar(255)", (col) => col.notNull())
    .addColumn("source_document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("target_document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("action_type", "varchar(255)", (col) => col.notNull())
    .addColumn("status", "varchar(50)", (col) => col.notNull())
    .addColumn("timestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .ifNotExists()
    .execute();

  await sql`CREATE INDEX IF NOT EXISTS idx_saga_id ON saga_log (saga_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_saga_target ON saga_log (target_document_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_saga_target").ifExists().execute();
  await db.schema.dropIndex("idx_saga_id").ifExists().execute();
  await db.schema.dropTable("saga_log").ifExists().execute();
}
