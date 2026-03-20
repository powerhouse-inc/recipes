import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface DocumentRow {
  document_id: string;
  document_type: string;
  name: string;
  content_summary: string;
  revision: number;
  updated_at: Timestamp;
}

export interface DocumentTagRow {
  id: Generated<number>;
  document_id: string;
  tag: string;
}

export interface CatalogDB {
  documents: DocumentRow;
  document_tags: DocumentTagRow;
}
