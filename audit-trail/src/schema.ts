import type { ColumnType, Generated } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface AuditEntry {
  id: Generated<number>;
  signer_address: string;
  signer_network_id: string;
  signer_chain_id: number;
  app_name: string;
  app_key: string;
  action_type: string;
  document_id: string;
  document_type: string;
  timestamp: Timestamp;
}

export interface AuditDB {
  audit_log: AuditEntry;
}
