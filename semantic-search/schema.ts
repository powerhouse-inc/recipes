import type { ColumnType } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface SemanticIndex {
  document_id: string;
  document_type: string;
  title: string;
  content: string;
  content_hash: string;
  // pgvector column — written as a '[1,2,3]' literal cast to ::vector,
  // read back in the same text form.
  embedding: ColumnType<string, string, string>;
  updated_at: Timestamp;
}

export interface SemanticSearchDB {
  semantic_index: SemanticIndex;
}
