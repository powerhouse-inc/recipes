import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { vector } from "@electric-sql/pglite/vector";
import type { OperationWithContext } from "document-model";
import type { SemanticSearchDB } from "./schema.js";
import { up, down } from "./migrations.js";
import { SemanticSearchProcessor } from "./processor.js";
import { createSimilarityQuery } from "./query.js";
import {
  EMBEDDING_DIM,
  MAX_EMBED_CHARS,
  truncateForEmbedding,
  type EmbedFn,
} from "./utils.js";

function createTestDb() {
  const pglite = new KyselyPGlite({ extensions: { vector } });
  const db = new Kysely<SemanticSearchDB>({ dialect: pglite.dialect });
  return { db };
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic offline stand-in for the real embedder: every word hashes to
 * a fixed pseudo-random direction and a text's vector is the normalized sum,
 * so texts sharing vocabulary land closer in cosine space. That is enough to
 * test similarity ordering and the processor mechanics without downloading a
 * model — keeping CI offline. demo.ts uses the real model.
 */
function fakeEmbed(text: string): Promise<number[]> {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const word of words) {
    let h = fnv1a(word);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      vec[i] += (h / 0xffffffff) * 2 - 1;
    }
  }
  const norm = Math.hypot(...vec) || 1;
  return Promise.resolve(vec.map((v) => v / norm));
}

function makeOp(overrides?: {
  documentId?: string;
  documentType?: string;
  actionType?: string;
  resultingState?: Record<string, unknown>;
}): OperationWithContext {
  const ts = String(Date.now());
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
        : { resultingState: JSON.stringify({ header: { name: "Test Doc" } }) }),
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

describe("SemanticSearchProcessor", () => {
  let db: Kysely<SemanticSearchDB>;
  let processor: SemanticSearchProcessor;
  let embedCalls: number;
  const countingEmbed: EmbedFn = (text) => {
    embedCalls++;
    return fakeEmbed(text);
  };

  beforeAll(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    await up(db);
    embedCalls = 0;
    processor = new SemanticSearchProcessor(db, countingEmbed);
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
  });

  it("embeds a document and makes it findable by similarity", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-1",
        documentType: "makerdao/budget",
        resultingState: {
          header: { name: "Quarterly Budget" },
          description: "Finance report for Q1",
        },
      }),
    ]);

    const rows = await db.selectFrom("semantic_index").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].document_id).toBe("doc-1");
    expect(rows[0].document_type).toBe("makerdao/budget");
    expect(rows[0].title).toBe("Quarterly Budget");

    const query = createSimilarityQuery(db, fakeEmbed);
    const results = await query.searchSimilar("budget", 5);
    expect(results).toHaveLength(1);
    expect(results[0].document_id).toBe("doc-1");
  });

  it("ranks related content above unrelated content", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-pets",
        resultingState: {
          header: { name: "Pet Care" },
          body: "dogs and cats are friendly household pets",
        },
      }),
      makeOp({
        documentId: "doc-tax",
        resultingState: {
          header: { name: "Tax Filing" },
          body: "fiscal year ledger accounting and tax depreciation",
        },
      }),
    ]);

    const query = createSimilarityQuery(db, fakeEmbed);
    const results = await query.searchSimilar("friendly dogs", 10);

    const pets = results.find((r) => r.document_id === "doc-pets")!;
    const tax = results.find((r) => r.document_id === "doc-tax")!;
    expect(pets.similarity).toBeGreaterThan(tax.similarity);
    expect(results[0].document_id).toBe("doc-pets");
  });

  it("skips re-embedding when content is unchanged", async () => {
    const state = {
      header: { name: "Stable Doc" },
      body: "this content does not change",
    };
    await processor.onOperations([
      makeOp({ documentId: "doc-stable", resultingState: state }),
    ]);
    const callsAfterFirst = embedCalls;

    await processor.onOperations([
      makeOp({ documentId: "doc-stable", resultingState: state }),
    ]);
    expect(embedCalls).toBe(callsAfterFirst);
  });

  it("re-embeds when content changes", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-stable",
        resultingState: {
          header: { name: "Stable Doc" },
          body: "now the content is different",
        },
      }),
    ]);

    const row = await db
      .selectFrom("semantic_index")
      .selectAll()
      .where("document_id", "=", "doc-stable")
      .executeTakeFirstOrThrow();
    expect(row.content).toContain("different");
  });

  it("rejects embeddings with the wrong dimension", async () => {
    const badProcessor = new SemanticSearchProcessor(db, () =>
      Promise.resolve([0.1, 0.2, 0.3]),
    );

    await expect(
      badProcessor.onOperations([makeOp({ documentId: "doc-bad-dim" })]),
    ).rejects.toThrow(/384.*got 3/);
  });

  it("handles DELETE_DOCUMENT by removing the embedding", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-to-delete",
        resultingState: { header: { name: "Doomed Document" } },
      }),
    ]);

    await processor.onOperations([makeDeleteOp("doc-to-delete")]);

    const rows = await db
      .selectFrom("semantic_index")
      .selectAll()
      .where("document_id", "=", "doc-to-delete")
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("does nothing for an empty operations list", async () => {
    const callsBefore = embedCalls;
    await processor.onOperations([]);
    expect(embedCalls).toBe(callsBefore);
  });

  it("skips operations without resultingState", async () => {
    const callsBefore = embedCalls;

    const op = makeOp({ documentId: "doc-no-state" });
    (op.context as any).resultingState = undefined;
    await processor.onOperations([op]);

    expect(embedCalls).toBe(callsBefore);
  });

  it("onDisconnect completes without error", async () => {
    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});

describe("truncateForEmbedding", () => {
  it("leaves short text untouched", () => {
    expect(truncateForEmbedding("hello")).toBe("hello");
  });

  it("truncates text past the embedding window", () => {
    const long = "x".repeat(MAX_EMBED_CHARS + 100);
    expect(truncateForEmbedding(long)).toHaveLength(MAX_EMBED_CHARS);
  });
});
