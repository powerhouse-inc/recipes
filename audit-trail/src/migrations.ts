import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("audit_log")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("signer_address", "varchar(255)", (col) => col.notNull())
    .addColumn("signer_network_id", "varchar(255)", (col) => col.notNull())
    .addColumn("signer_chain_id", "integer", (col) => col.notNull())
    .addColumn("app_name", "varchar(255)", (col) => col.notNull())
    .addColumn("app_key", "varchar(255)", (col) => col.notNull())
    .addColumn("action_type", "varchar(255)", (col) => col.notNull())
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("document_type", "varchar(255)", (col) => col.notNull())
    .addColumn("timestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .ifNotExists()
    .execute();

  await sql`CREATE INDEX IF NOT EXISTS idx_audit_signer ON audit_log (signer_address)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_log (document_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_audit_timestamp").ifExists().execute();
  await db.schema.dropIndex("idx_audit_document").ifExists().execute();
  await db.schema.dropIndex("idx_audit_signer").ifExists().execute();
  await db.schema.dropTable("audit_log").ifExists().execute();
}
