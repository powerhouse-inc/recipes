import type { Kysely } from "kysely";
import type { AuditDB } from "./schema.js";

export interface AuditQueryResult {
  id: number;
  signer_address: string;
  signer_network_id: string;
  signer_chain_id: number;
  app_name: string;
  app_key: string;
  action_type: string;
  document_id: string;
  document_type: string;
  timestamp: Date;
}

export function createAuditQuery(db: Kysely<AuditDB>) {
  return {
    byUser(
      address: string,
      limit = 50,
      offset = 0,
    ): Promise<AuditQueryResult[]> {
      return db
        .selectFrom("audit_log")
        .selectAll()
        .where("signer_address", "=", address)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    },

    byDocument(
      documentId: string,
      limit = 50,
      offset = 0,
    ): Promise<AuditQueryResult[]> {
      return db
        .selectFrom("audit_log")
        .selectAll()
        .where("document_id", "=", documentId)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    },

    byTimeRange(
      from: Date,
      to: Date,
      limit = 50,
      offset = 0,
    ): Promise<AuditQueryResult[]> {
      return db
        .selectFrom("audit_log")
        .selectAll()
        .where("timestamp", ">=", from)
        .where("timestamp", "<=", to)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    },
  };
}
