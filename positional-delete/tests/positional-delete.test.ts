/**
 * Positional deletion against real reactors: a delete refuses only the
 * operations that sort after it in the merged order, refused operations
 * are stored as denied rather than dropped, and the view serves state as
 * of the deletion. The last test shows the legacy behavior the decision
 * model replaces: without it, one deleted flag rejects a whole load,
 * legitimate pre-delete history included.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  garbageCollect,
  isDenied,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import type { ILogger, Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  FieldLog,
  logObservation,
  utils,
  type FieldLogDocument,
} from "document-models/field-log/v1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Denials and failed loads are expected here; keep the error channel quiet. */
function quietLogger(): ILogger {
  const drop = () => {};
  return {
    level: "error",
    errorHandler: drop,
    child: () => quietLogger(),
    verbose: drop,
    debug: drop,
    info: drop,
    warn: drop,
    error: drop,
  };
}

function buildReactor(documentDecisions: boolean): Promise<IReactor> {
  return new ReactorBuilder()
    .withDocumentModelSources([FieldLog, documentModelDocumentModelModule])
    .withLogger(quietLogger())
    .withExecutorConfig({
      featureFlags: { documentDecisions },
    })
    .build();
}

describe("positional deletion", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;
  let docId: string;

  async function settle(reactor: IReactor, job: JobInfo): Promise<void> {
    for (;;) {
      const status = await reactor.getJobStatus(job.id);
      if (status.status === JobStatus.READ_READY) return;
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message ?? "job failed");
      }
      await sleep(5);
    }
  }

  async function log(
    reactor: IReactor,
    id: string,
    note: string,
  ): Promise<void> {
    await sleep(10); // give every operation its own millisecond
    await settle(
      reactor,
      await reactor.execute(docId, "main", [logObservation({ id, note })]),
    );
  }

  async function sync(
    from: IReactor,
    to: IReactor,
    scope: string,
  ): Promise<void> {
    const ops = await from.getOperations(docId, {
      branch: "main",
      scopes: [scope],
    });
    const results = ops[scope]?.results ?? [];
    if (results.length === 0) return;
    await settle(to, await to.load(docId, "main", results));
  }

  async function effective(
    reactor: IReactor,
  ): Promise<Array<{ id: string | undefined; deniedReason: string | undefined }>> {
    const ops = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    return garbageCollect(
      sortOperations([...(ops.global?.results ?? [])] as Operation[]),
    ).map((operation) => ({
      id: (operation.action.input as { id?: string }).id,
      deniedReason: operation.deniedReason,
    }));
  }

  /**
   * The split-brain from the demo: B logs before and after A's delete
   * without knowing about it, then both directions sync.
   */
  async function splitBrain(): Promise<void> {
    const document = utils.createDocument();
    docId = document.header.id;
    await settle(reactorA, await reactorA.create(document));
    await sync(reactorA, reactorB, "document");

    await log(reactorB, "obs-before", "sorts before the delete");
    await sleep(10);
    await settle(reactorA, await reactorA.deleteDocument(docId));
    await log(reactorB, "obs-after", "sorts after the delete");

    await sync(reactorA, reactorB, "document");
    await sync(reactorB, reactorA, "global");
  }

  afterEach(() => {
    reactorA?.kill();
    reactorB?.kill();
  });

  describe("with the decision model", () => {
    beforeEach(async () => {
      reactorA = await buildReactor(true);
      reactorB = await buildReactor(true);
      await splitBrain();
    });

    it("judges each operation at its position and converges", async () => {
      const expected = [
        { id: "obs-before", deniedReason: undefined },
        { id: "obs-after", deniedReason: "document deleted" },
      ];
      expect(await effective(reactorA)).toEqual(expected);
      expect(await effective(reactorB)).toEqual(expected);
    });

    it("stores the refused operation instead of dropping it", async () => {
      const ops = await reactorA.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      });
      const denied = garbageCollect(
        sortOperations([...(ops.global?.results ?? [])] as Operation[]),
      ).filter((operation) => isDenied(operation));
      expect(denied).toHaveLength(1);
      expect(
        (denied[0].action.input as { id: string }).id,
      ).toBe("obs-after");
    });

    it("serves the document as of the deletion boundary on the load path", async () => {
      // Reactor A received B's observations via load, so the denied one
      // was never applied to its state: reading the deleted document
      // serves legitimate history up to the boundary instead of a hole.
      //
      // Reactor B is different: it had already applied obs-after before
      // the delete arrived, and its materialized view is not rebuilt
      // retroactively. The effective operation stream (asserted above)
      // is the consensus artifact — any rebuild or replay from it sees
      // the boundary state.
      const doc = await reactorA.get<FieldLogDocument>(docId);
      expect(doc.state.document.isDeleted).toBe(true);
      expect(
        doc.state.global.observations.map((observation) => observation.id),
      ).toEqual(["obs-before"]);
    });

    it("fails a write at origin once the delete is known", async () => {
      await expect(log(reactorB, "obs-late", "too late")).rejects.toThrow(
        /deleted/i,
      );
      // Nothing was stored for it — the effective set is unchanged.
      expect(
        (await effective(reactorB)).map((operation) => operation.id),
      ).toEqual(["obs-before", "obs-after"]);
    });
  });

  describe("without the decision model (legacy)", () => {
    it("rejects the whole load, legitimate pre-delete history included", async () => {
      reactorA = await buildReactor(true);
      reactorB = await buildReactor(false);

      const document = utils.createDocument();
      docId = document.header.id;
      await settle(reactorA, await reactorA.create(document));
      await log(reactorA, "obs-before", "sorts before the delete");
      await sleep(10);
      await settle(reactorA, await reactorA.deleteDocument(docId));

      // The delete lands on B first, then B is offered the history. With
      // the decision model this exact sequence admits obs-before (that is
      // the B→A direction of the split-brain tests above); without it,
      // one deleted flag rejects the whole load.
      await sync(reactorA, reactorB, "document");
      await expect(sync(reactorA, reactorB, "global")).rejects.toThrow(
        /deleted/i,
      );
      expect(await effective(reactorB)).toEqual([]);
    });
  });
});
