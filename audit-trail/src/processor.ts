import type { OperationWithContext } from "document-model";
import type {
  IProcessor,
  ProcessorFactory,
  ProcessorFilter,
} from "@powerhousedao/reactor";
import type { AuditDB } from "./schema.js";
import type { Kysely } from "kysely";

function getSignerContext(op: OperationWithContext) {
  const signer = op.operation.action.context?.signer;
  if (!signer) return undefined;
  return {
    signer_address: signer.user.address,
    signer_network_id: signer.user.networkId,
    signer_chain_id: signer.user.chainId,
    app_name: signer.app.name,
    app_key: signer.app.key,
  };
}

/**
 * A Reactor processor that inspects ActionSigner context on every operation
 * and inserts an immutable audit log entry into a PostgreSQL table.
 *
 * Operations without a signer are silently skipped.
 */
export class AuditTrailProcessor implements IProcessor {
  constructor(private readonly db: Kysely<AuditDB>) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const rows = [];

    for (const op of operations) {
      const signer = getSignerContext(op);
      if (!signer) continue;

      rows.push({
        ...signer,
        action_type: op.operation.action.type,
        document_id: op.context.documentId,
        document_type: op.context.documentType,
        timestamp: new Date(isNaN(Number(op.operation.action.timestampUtcMs)) ? op.operation.action.timestampUtcMs : Number(op.operation.action.timestampUtcMs)),
      });
    }

    if (rows.length === 0) return;

    await this.db.insertInto("audit_log").values(rows).execute();
  }

  async onDisconnect(): Promise<void> {}
}

/**
 * Creates a ProcessorFactory that produces an AuditTrailProcessor.
 *
 * @example
 * ```ts
 * import { Kysely, PostgresDialect } from "kysely";
 * import { up } from "./migrations.js";
 *
 * const db = new Kysely<AuditDB>({ dialect: new PostgresDialect({ pool }) });
 * await up(db);
 *
 * await processorManager.registerFactory(
 *   "audit-trail",
 *   createAuditTrailFactory({
 *     db,
 *     filter: { branch: ["main"] },
 *   }),
 * );
 * ```
 */
export function createAuditTrailFactory(config: {
  db: Kysely<AuditDB>;
  filter: ProcessorFilter;
}): ProcessorFactory {
  return () => [
    {
      processor: new AuditTrailProcessor(config.db),
      filter: config.filter,
      startFrom: "beginning",
    },
  ];
}
