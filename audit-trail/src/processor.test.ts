import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import type { OperationWithContext } from "document-model";
import type { AuditDB } from "./schema.js";
import { up, down } from "./migrations.js";
import { AuditTrailProcessor } from "./processor.js";

function createTestDb() {
  const pglite = new KyselyPGlite();
  const db = new Kysely<AuditDB>({ dialect: pglite.dialect });
  return { db };
}

function makeOp(
  address?: string,
  overrides?: {
    actionType?: string;
    documentId?: string;
    documentType?: string;
    timestampMs?: string;
    networkId?: string;
    chainId?: number;
    appName?: string;
    appKey?: string;
  },
): OperationWithContext {
  const ts = overrides?.timestampMs ?? String(Date.now());
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: ts,
      hash: "abc",
      action: {
        id: "act-1",
        type: overrides?.actionType ?? "SOME_ACTION",
        timestampUtcMs: ts,
        input: {},
        scope: "global",
        ...(address
          ? {
              context: {
                signer: {
                  user: {
                    address,
                    networkId: overrides?.networkId ?? "eip155",
                    chainId: overrides?.chainId ?? 1,
                  },
                  app: {
                    name: overrides?.appName ?? "test-app",
                    key: overrides?.appKey ?? "key-123",
                  },
                  signatures: [],
                },
              },
            }
          : {}),
      },
    },
    context: {
      documentId: overrides?.documentId ?? "doc-1",
      documentType: overrides?.documentType ?? "makerdao/budget",
      scope: "global",
      branch: "main",
      ordinal: 0,
    },
  };
}

describe("AuditTrailProcessor", () => {
  let db: Kysely<AuditDB>;
  let processor: AuditTrailProcessor;

  beforeAll(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    await up(db);
    processor = new AuditTrailProcessor(db);
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
  });

  it("logs a signed operation with all signer fields", async () => {
    await processor.onOperations([
      makeOp("0xabc123", {
        actionType: "CREATE_BUDGET",
        documentId: "doc-42",
        documentType: "makerdao/budget",
        networkId: "eip155",
        chainId: 1,
        appName: "connect",
        appKey: "pk-1",
      }),
    ]);

    const rows = await db.selectFrom("audit_log").selectAll().execute();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.signer_address).toBe("0xabc123");
    expect(row.signer_network_id).toBe("eip155");
    expect(row.signer_chain_id).toBe(1);
    expect(row.app_name).toBe("connect");
    expect(row.app_key).toBe("pk-1");
    expect(row.action_type).toBe("CREATE_BUDGET");
    expect(row.document_id).toBe("doc-42");
    expect(row.document_type).toBe("makerdao/budget");
    expect(row.timestamp).toBeInstanceOf(Date);
  });

  it("skips operations without a signer", async () => {
    const countBefore = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([
      makeOp(undefined),
      makeOp(undefined),
    ]);

    const countAfter = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("batch-inserts multiple signed operations", async () => {
    const countBefore = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([
      makeOp("0xuser1", { actionType: "A", documentId: "d1" }),
      makeOp("0xuser2", { actionType: "B", documentId: "d2" }),
      makeOp("0xuser1", { actionType: "C", documentId: "d3" }),
    ]);

    const countAfter = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(Number(countAfter.count) - Number(countBefore.count)).toBe(3);
  });

  it("handles a mix of signed and unsigned operations", async () => {
    const countBefore = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([
      makeOp("0xsigned"),
      makeOp(undefined),
      makeOp("0xalsosigned"),
      makeOp(undefined),
    ]);

    const countAfter = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(Number(countAfter.count) - Number(countBefore.count)).toBe(2);
  });

  it("does nothing for an empty operations list", async () => {
    const countBefore = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([]);

    const countAfter = await db
      .selectFrom("audit_log")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("onDisconnect completes without error", async () => {
    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});
