/**
 * Convergent authorization across two real reactors: a revocation races
 * an approval, both succeed locally, and after syncing both directions
 * both reactors independently reach the same verdict — decided by the
 * approval's position in the merged order relative to the revocation,
 * never by a verdict shipped from the origin.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type IReactorClient,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  AUTH_NO_GRANT_REASON,
  garbageCollect,
  initializeAuth,
  removeGrant,
  setGrant,
  sortOperations,
  type Grant,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger, ISigner, Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  approveExpense,
  ExpenseReport,
  submitExpense,
  utils,
  type ExpenseReportDocument,
} from "document-models/expense-report/v1";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildSignedReactor, createSigner } from "../src/signers.js";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";

const GRANT_ALICE_ADMIN: Grant = {
  id: "g-alice-admin",
  description: "Alice administers the policy",
  effect: "allow",
  principal: { address: ALICE },
  capability: { can: "execute", scope: "auth" },
};

const GRANT_ALICE_ALL: Grant = {
  id: "g-alice-all",
  description: "Alice may do anything",
  effect: "allow",
  principal: { address: ALICE },
  capability: { can: "execute", scope: "*" },
};

const GRANT_BOB_APPROVE: Grant = {
  id: "g-bob-approve",
  description: "Bob may approve expenses",
  effect: "allow",
  principal: { address: BOB },
  capability: { can: "execute", scope: "global", operation: ["APPROVE_EXPENSE"] },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Refusals are expected here; keep the reactor's error channel quiet. */
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

const signers = new Map<string, ISigner>();
const clientsOf = new WeakMap<IReactor, Map<string, IReactorClient>>();

beforeAll(async () => {
  for (const address of [ALICE, BOB]) {
    signers.set(address, await createSigner("revocation-race-tests", address));
  }
});

/** A reactor that trusts Alice's and Bob's keys, with a signing client each. */
async function buildReactor(): Promise<IReactor> {
  const { reactor, clients } = await buildSignedReactor(
    new ReactorBuilder()
      .withDocumentModelSources([
        ExpenseReport,
        documentModelDocumentModelModule,
      ])
      .withLogger(quietLogger())
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement: true },
      }),
    [...signers.values()],
  );
  clientsOf.set(reactor, clients);
  return reactor;
}

describe("the revocation race", () => {
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

  async function execute(
    reactor: IReactor,
    caller: string,
    action: Action,
  ): Promise<void> {
    await sleep(10); // give every operation its own millisecond
    await settle(
      reactor,
      await clientsOf.get(reactor)!.get(caller)!.executeAsync(docId, "main", [
        action,
      ]),
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

  async function syncAll(): Promise<void> {
    for (const scope of ["document", "auth", "global"]) {
      await sync(reactorA, reactorB, scope);
      await sync(reactorB, reactorA, scope);
    }
  }

  async function verdicts(
    reactor: IReactor,
  ): Promise<Array<{ type: string; deniedReason: string | undefined }>> {
    const ops = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    return garbageCollect(
      sortOperations([...(ops.global?.results ?? [])] as Operation[]),
    ).map((operation) => ({
      type: operation.action.type,
      deniedReason: operation.deniedReason,
    }));
  }

  beforeEach(async () => {
    reactorA = await buildReactor();
    reactorB = await buildReactor();

    const document = utils.createDocument();
    docId = document.header.id;
    await settle(reactorA, await reactorA.create(document, signers.get(ALICE)));
    await execute(
      reactorA,
      ALICE,
      initializeAuth({
        version: 1,
        grants: [GRANT_ALICE_ADMIN, GRANT_ALICE_ALL, GRANT_BOB_APPROVE],
      }),
    );
    await execute(
      reactorA,
      ALICE,
      submitExpense({ id: "e1", memo: "team lunch", amountCents: 4800 }),
    );
    await syncAll();
  });

  afterEach(() => {
    reactorA?.kill();
    reactorB?.kill();
  });

  it("denies the approval on both reactors when the revocation sorts first", async () => {
    await execute(reactorA, ALICE, removeGrant({ id: GRANT_BOB_APPROVE.id }));
    await execute(reactorB, BOB, approveExpense({ id: "e1" }));
    await syncAll();

    const expected = [
      { type: "SUBMIT_EXPENSE", deniedReason: undefined },
      { type: "APPROVE_EXPENSE", deniedReason: AUTH_NO_GRANT_REASON },
    ];
    expect(await verdicts(reactorA)).toEqual(expected);
    expect(await verdicts(reactorB)).toEqual(expected);

    // The load-path view never applied the denied approval.
    const doc = await reactorA.get<ExpenseReportDocument>(docId);
    expect(doc.state.global.expenses[0].status).toBe("PENDING");
  });

  it("keeps the approval on both reactors when it sorts before the revocation", async () => {
    await execute(reactorB, BOB, approveExpense({ id: "e1" }));
    await execute(reactorA, ALICE, removeGrant({ id: GRANT_BOB_APPROVE.id }));
    await syncAll();

    const expected = [
      { type: "SUBMIT_EXPENSE", deniedReason: undefined },
      { type: "APPROVE_EXPENSE", deniedReason: undefined },
    ];
    expect(await verdicts(reactorA)).toEqual(expected);
    expect(await verdicts(reactorB)).toEqual(expected);

    const doc = await reactorA.get<ExpenseReportDocument>(docId);
    expect(doc.state.global.expenses[0].status).toBe("APPROVED");
    expect(doc.state.global.expenses[0].approvedBy).toBe(BOB);
  });

  it("refuses a fresh approval at origin once the revocation is known", async () => {
    await execute(reactorA, ALICE, removeGrant({ id: GRANT_BOB_APPROVE.id }));
    await syncAll();

    await expect(
      execute(reactorB, BOB, approveExpense({ id: "e1" })),
    ).rejects.toThrow(/Authorization denied.*APPROVE_EXPENSE/);
  });

  it("refuses a backdated auth operation — the policy stream is strictly monotonic", async () => {
    const backdated = {
      ...setGrant({ grant: GRANT_ALICE_ALL }),
      timestampUtcMs: new Date(Date.now() - 60_000).toISOString(),
    };
    await expect(execute(reactorA, ALICE, backdated)).rejects.toThrow(
      /monotonic/i,
    );
  });
});
