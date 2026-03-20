import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { createRelationalDb } from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";
import type { CatalogDB } from "./schema.js";
import { down } from "./migrations.js";
import { CatalogProcessor } from "./processor.js";

function createTestDb() {
  const pglite = new KyselyPGlite();
  const db = new Kysely<CatalogDB>({ dialect: pglite.dialect });
  return { db };
}

function makeOp(overrides?: {
  documentId?: string;
  documentType?: string;
  actionType?: string;
  resultingState?: Record<string, unknown>;
  index?: number;
}): OperationWithContext {
  const ts = String(Date.now());
  return {
    operation: {
      id: "op-1",
      index: overrides?.index ?? 0,
      skip: 0,
      timestampUtcMs: ts,
      hash: "abc",
      action: {
        id: "act-1",
        type: overrides?.actionType ?? "SOME_ACTION",
        timestampUtcMs: ts,
        input: {},
        scope: "global",
      },
    },
    context: {
      documentId: overrides?.documentId ?? "doc-1",
      documentType: overrides?.documentType ?? "example/doc",
      scope: "global",
      branch: "main",
      ordinal: 0,
      ...(overrides?.resultingState !== undefined
        ? { resultingState: JSON.stringify(overrides.resultingState) }
        : { resultingState: JSON.stringify({ name: "Test Doc" }) }),
    },
  };
}

function makeDeleteOp(documentId: string): OperationWithContext {
  const ts = String(Date.now());
  return {
    operation: {
      id: "op-del",
      index: 0,
      skip: 0,
      timestampUtcMs: ts,
      hash: "def",
      action: {
        id: "act-del",
        type: "DELETE_DOCUMENT",
        timestampUtcMs: ts,
        input: { documentId },
        scope: "global",
      },
    },
    context: {
      documentId,
      documentType: "example/doc",
      scope: "global",
      branch: "main",
      ordinal: 0,
    },
  };
}

describe("CatalogProcessor", () => {
  let db: Kysely<CatalogDB>;
  let processor: CatalogProcessor;

  beforeAll(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    const relationalDb = createRelationalDb<CatalogDB>(db);
    processor = new CatalogProcessor("catalog", { branch: ["main"] }, relationalDb);
    await processor.initAndUpgrade();
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
  });

  it("upserts a document from resultingState", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-1",
        documentType: "makerdao/budget",
        resultingState: { name: "Budget Q1", description: "Quarterly budget" },
        index: 3,
      }),
    ]);

    const rows = await db.selectFrom("documents").selectAll().execute();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.document_id).toBe("doc-1");
    expect(row.document_type).toBe("makerdao/budget");
    expect(row.name).toBe("Budget Q1");
    expect(row.content_summary).toBe("Quarterly budget");
    expect(row.revision).toBe(3);
  });

  it("updates an existing document on new operation", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-1",
        documentType: "makerdao/budget",
        resultingState: { name: "Budget Q1 Updated" },
        index: 5,
      }),
    ]);

    const rows = await db.selectFrom("documents").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Budget Q1 Updated");
    expect(rows[0].revision).toBe(5);
  });

  it("indexes tags from resultingState", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-tagged",
        resultingState: { name: "Tagged", tags: ["finance", "q1"] },
      }),
    ]);

    const tags = await db
      .selectFrom("document_tags")
      .select("tag")
      .where("document_id", "=", "doc-tagged")
      .execute();
    expect(tags.map((t) => t.tag).sort()).toEqual(["finance", "q1"]);
  });

  it("replaces tags on update", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-tagged",
        resultingState: { name: "Tagged", tags: ["finance", "q2"] },
      }),
    ]);

    const tags = await db
      .selectFrom("document_tags")
      .select("tag")
      .where("document_id", "=", "doc-tagged")
      .execute();
    expect(tags.map((t) => t.tag).sort()).toEqual(["finance", "q2"]);
  });

  it("handles DELETE_DOCUMENT by removing document and tags", async () => {
    // Ensure document exists
    await processor.onOperations([
      makeOp({
        documentId: "doc-to-delete",
        resultingState: { name: "Doomed", tags: ["temp"] },
      }),
    ]);

    await processor.onOperations([makeDeleteOp("doc-to-delete")]);

    const docs = await db
      .selectFrom("documents")
      .selectAll()
      .where("document_id", "=", "doc-to-delete")
      .execute();
    expect(docs).toHaveLength(0);

    const tags = await db
      .selectFrom("document_tags")
      .selectAll()
      .where("document_id", "=", "doc-to-delete")
      .execute();
    expect(tags).toHaveLength(0);
  });

  it("does nothing for an empty operations list", async () => {
    const countBefore = await db
      .selectFrom("documents")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([]);

    const countAfter = await db
      .selectFrom("documents")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("indexes documents of any type", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-a",
        documentType: "type-a/foo",
        resultingState: { name: "Foo" },
      }),
      makeOp({
        documentId: "doc-b",
        documentType: "type-b/bar",
        resultingState: { name: "Bar" },
      }),
    ]);

    const types = await db
      .selectFrom("documents")
      .select("document_type")
      .where("document_id", "in", ["doc-a", "doc-b"])
      .execute();
    const typeSet = new Set(types.map((t) => t.document_type));
    expect(typeSet.has("type-a/foo")).toBe(true);
    expect(typeSet.has("type-b/bar")).toBe(true);
  });

  it("skips operations without resultingState", async () => {
    const countBefore = await db
      .selectFrom("documents")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const op = makeOp({ documentId: "doc-no-state" });
    // Remove resultingState
    (op.context as any).resultingState = undefined;

    await processor.onOperations([op]);

    const countAfter = await db
      .selectFrom("documents")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("onDisconnect completes without error", async () => {
    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});
