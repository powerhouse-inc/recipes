/**
 * Group principals end to end: a reactor-group roster gates approvals on an
 * expense report, membership changes are single operations on the roster,
 * membership is judged at each operation's position, and a replica that does
 * not hold the roster fails closed until its history arrives.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  addMember,
  ReactorGroup,
  removeMember,
  utils as groupUtils,
} from "@powerhousedao/reactor-group/document-models/reactor-group";
import {
  AUTH_NO_GRANT_REASON,
  garbageCollect,
  initializeAuth,
  sortOperations,
  type Grant,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger, Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  approveExpense,
  ExpenseReport,
  submitExpense,
  utils as expenseUtils,
} from "document-models/expense-report/v1";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC2";

function adminGrants(): Grant[] {
  return [
    {
      id: "g-alice-admin",
      description: "Alice administers the policy",
      effect: "allow",
      principal: { address: ALICE },
      capability: { can: "execute", scope: "auth" },
    },
    {
      id: "g-alice-all",
      description: "Alice may do anything",
      effect: "allow",
      principal: { address: ALICE },
      capability: { can: "execute", scope: "*" },
    },
  ];
}

function reviewersGrant(rosterId: string): Grant {
  return {
    id: "g-reviewers-approve",
    description: "the reviewers group may approve expenses",
    effect: "allow",
    principal: { group: rosterId },
    capability: {
      can: "execute",
      scope: "global",
      operation: ["APPROVE_EXPENSE"],
    },
  };
}

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

function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "group-principals-test", key: `did:test:${address}` },
        signatures: [],
      },
    },
  };
}

async function buildReactor(): Promise<IReactor> {
  return new ReactorBuilder()
    .withDocumentModelSources([
      ExpenseReport,
      ReactorGroup,
      documentModelDocumentModelModule,
    ])
    .withLogger(quietLogger())
    .withExecutorConfig({
      featureFlags: {
        documentDecisions: true,
        authEnforcement: true,
        authGroups: true,
      },
    })
    .build();
}

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
  docId: string,
  caller: string,
  action: Action,
): Promise<void> {
  await sleep(10); // give every operation its own millisecond
  await settle(
    reactor,
    await reactor.execute(docId, "main", [signedBy(action, caller)]),
  );
}

async function verdicts(
  reactor: IReactor,
  docId: string,
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

async function syncScope(
  from: IReactor,
  to: IReactor,
  docId: string,
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

describe("group principals", () => {
  let reactor: IReactor;
  let rosterId: string;
  let expenseId: string;

  beforeEach(async () => {
    reactor = await buildReactor();

    const roster = groupUtils.createDocument();
    rosterId = roster.header.id;
    await settle(reactor, await reactor.create(roster));
    await execute(
      reactor,
      rosterId,
      ALICE,
      initializeAuth({ version: 1, grants: adminGrants() }),
    );
    await execute(reactor, rosterId, ALICE, addMember({ address: BOB }));

    const expense = expenseUtils.createDocument();
    expenseId = expense.header.id;
    await settle(reactor, await reactor.create(expense));
    await execute(
      reactor,
      expenseId,
      ALICE,
      initializeAuth({
        version: 1,
        grants: [...adminGrants(), reviewersGrant(rosterId)],
      }),
    );
    await execute(
      reactor,
      expenseId,
      ALICE,
      submitExpense({ id: "e1", memo: "team lunch", amountCents: 4800 }),
    );
  });

  afterEach(() => {
    reactor?.kill();
  });

  it("admits a member and refuses a non-member", async () => {
    await execute(reactor, expenseId, BOB, approveExpense({ id: "e1" }));

    await expect(
      execute(reactor, expenseId, CAROL, approveExpense({ id: "e1" })),
    ).rejects.toThrow(/denied|authoriz/i);
  });

  it("the roster is governed by its own policy", async () => {
    await expect(
      execute(reactor, rosterId, CAROL, addMember({ address: CAROL })),
    ).rejects.toThrow(/denied|authoriz/i);
  });

  it("hiring is one membership operation, with no policy write", async () => {
    await expect(
      execute(reactor, expenseId, CAROL, approveExpense({ id: "e1" })),
    ).rejects.toThrow(/denied|authoriz/i);

    await execute(reactor, rosterId, ALICE, addMember({ address: CAROL }));
    await execute(reactor, expenseId, CAROL, approveExpense({ id: "e1" }));

    // The expense report's auth stream never grew past its genesis.
    const authOps = await reactor.getOperations(expenseId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(authOps.auth?.results ?? []).toHaveLength(1);
  });

  it("offboarding refuses the next approval", async () => {
    await execute(reactor, rosterId, ALICE, removeMember({ address: BOB }));

    await expect(
      execute(reactor, expenseId, BOB, approveExpense({ id: "e1" })),
    ).rejects.toThrow(/denied|authoriz/i);
  });

  it("a removal timestamped before an accepted approval flips it to denied", async () => {
    const beforeApproval = new Date(Date.now() - 5).toISOString();
    await execute(reactor, expenseId, BOB, approveExpense({ id: "e1" }));
    expect(await verdicts(reactor, expenseId)).toEqual([
      { type: "SUBMIT_EXPENSE", deniedReason: undefined },
      { type: "APPROVE_EXPENSE", deniedReason: undefined },
    ]);

    const backdated = {
      ...removeMember({ address: BOB }),
      timestampUtcMs: beforeApproval,
    };
    await execute(reactor, rosterId, ALICE, backdated);

    // The membership change re-judges the referencing document in its own
    // job; wait for that job to land.
    await expect
      .poll(async () => verdicts(reactor, expenseId), { timeout: 10_000 })
      .toEqual([
        { type: "SUBMIT_EXPENSE", deniedReason: undefined },
        { type: "APPROVE_EXPENSE", deniedReason: AUTH_NO_GRANT_REASON },
      ]);
  });

  it("a replica without the roster fails closed, then converges", async () => {
    const other = await buildReactor();
    try {
      await execute(reactor, expenseId, BOB, approveExpense({ id: "e1" }));

      // The other replica receives the expense report but NOT the roster.
      for (const scope of ["document", "auth", "global"]) {
        await syncScope(reactor, other, expenseId, scope);
      }

      // Bob's approval was allowed at the origin, but this replica cannot
      // fold the roster: the group principal never matches. Fail closed.
      expect(await verdicts(other, expenseId)).toEqual([
        { type: "SUBMIT_EXPENSE", deniedReason: undefined },
        { type: "APPROVE_EXPENSE", deniedReason: AUTH_NO_GRANT_REASON },
      ]);

      // The roster's history arrives; the replica re-judges the documents
      // that reference it and both replicas agree.
      for (const scope of ["document", "auth", "global"]) {
        await syncScope(reactor, other, rosterId, scope);
      }

      await expect
        .poll(async () => verdicts(other, expenseId), { timeout: 10_000 })
        .toEqual(await verdicts(reactor, expenseId));

      expect(await verdicts(other, expenseId)).toEqual([
        { type: "SUBMIT_EXPENSE", deniedReason: undefined },
        { type: "APPROVE_EXPENSE", deniedReason: undefined },
      ]);
    } finally {
      other.kill();
    }
  });
});
