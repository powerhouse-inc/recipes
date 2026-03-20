import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string | undefined>;

export interface SagaLogEntry {
  id: Generated<number>;
  saga_id: string;
  step_name: string;
  source_document_id: string;
  target_document_id: string;
  action_type: string;
  status: string;
  timestamp: Timestamp;
}

export interface SagaDB {
  saga_log: SagaLogEntry;
}
