/**
 * Group principals in the auth scope, on a single reactor with the cascading
 * feature flags enabled (documentDecisions → authEnforcement → authGroups):
 *
 *   1. the roster is an ordinary reactor-group document, governed by its
 *      own auth scope — Bob cannot enroll himself
 *   2. an expense report's policy names the roster with a { group }
 *      principal; who may approve is a question the roster answers
 *   3. hiring Carol is ONE membership operation on the roster — the
 *      expense report's policy never changes, and Carol's next approval
 *      is admitted
 *   4. membership is judged at each operation's position: a membership
 *      removal timestamped BEFORE an already-accepted approval re-judges
 *      it, and the approval flips to denied
 *
 * The expense-report reducers contain no authorization code, and no
 * per-document writes happen when the team changes.
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
  type ReactorGroupDocument,
} from "@powerhousedao/reactor-group/document-models/reactor-group";
import {
  initializeAuth,
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

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC2";

function label(address: string): string {
  return address === ALICE
    ? "Alice"
    : address === BOB
      ? "Bob"
      : address === CAROL
        ? "Carol"
        : address;
}

/** The grants every document in this demo starts from. */
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

/** Reviewers — whoever the roster says they are at the operation's position. */
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

/**
 * Attaches signer context the way a signing client would. The admission
 * gate evaluates grants against action.context.signer — in production the
 * ReactorClient populates (and signs) this via .withSigner().
 */
function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: {
          name: "group-principals-demo",
          key: `did:demo:${label(address)}`,
        },
        signatures: [],
      },
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

async function waitForJob(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
  for (;;) {
    const status = await reactor.getJobStatus(job.id);
    if (
      status.status === JobStatus.READ_READY ||
      status.status === JobStatus.FAILED
    ) {
      return status;
    }
    await sleep(10);
  }
}

async function step(
  reactor: IReactor,
  docId: string,
  caller: string,
  action: Action,
  description: string,
): Promise<void> {
  // The auth stream must be strictly timestamp-monotonic, so give every
  // step its own millisecond.
  await sleep(15);
  const job = await reactor.execute(docId, "main", [signedBy(action, caller)]);
  const done = await waitForJob(reactor, job);
  if (done.status === JobStatus.FAILED) {
    console.log(`[${label(caller)}] ${description}`);
    console.log(`        → refused: ${done.error?.message ?? "job failed"}`);
  } else {
    console.log(`[${label(caller)}] ${description} → ok`);
  }
}

async function globalVerdicts(
  reactor: IReactor,
  docId: string,
): Promise<Array<{ type: string; denied: boolean }>> {
  const ops = await reactor.getOperations(docId, {
    branch: "main",
    scopes: ["global"],
  });
  return (ops.global?.results ?? []).map((operation: Operation) => ({
    type: operation.action.type,
    denied: operation.deniedReason !== undefined,
  }));
}

async function main() {
  console.log("group-principals: a roster document decides who may approve");
  console.log("════════════════════════════════════════════════════════════\n");

  process.stdout.write(
    "Starting reactor (documentDecisions + authEnforcement + authGroups)...",
  );
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
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
    .buildModule();
  const reactor: IReactor = reactorModule.reactor;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  // ─── The roster: an ordinary document, governed like any other ───────
  const roster = groupUtils.createDocument();
  const rosterId = roster.header.id;
  await waitForJob(reactor, await reactor.create(roster));
  console.log(`[Alice] created reviewers roster ${rosterId}\n`);

  await step(
    reactor,
    rosterId,
    ALICE,
    initializeAuth({ version: 1, grants: adminGrants() }),
    "initializeAuth on the ROSTER — membership changes are Alice-only",
  );

  await step(
    reactor,
    rosterId,
    BOB,
    addMember({ address: BOB }),
    "addMember(Bob) by Bob — self-enrollment",
  );

  await step(
    reactor,
    rosterId,
    ALICE,
    addMember({ address: BOB }),
    "addMember(Bob) by Alice — Bob joins the reviewers",
  );

  // ─── The expense report: its policy names the roster ─────────────────
  const expense = expenseUtils.createDocument();
  const expenseId = expense.header.id;
  await waitForJob(reactor, await reactor.create(expense));
  console.log(`\n[Alice] created expense report ${expenseId}`);

  await step(
    reactor,
    expenseId,
    ALICE,
    initializeAuth({
      version: 1,
      grants: [...adminGrants(), reviewersGrant(rosterId)],
    }),
    "initializeAuth on the EXPENSE REPORT — approvals gated on { group: roster }",
  );

  await step(
    reactor,
    expenseId,
    ALICE,
    submitExpense({ id: "e1", memo: "team lunch", amountCents: 4800 }),
    "submitExpense e1",
  );

  await step(
    reactor,
    expenseId,
    BOB,
    approveExpense({ id: "e1" }),
    "approveExpense e1 (Bob is on the roster)",
  );

  await step(
    reactor,
    expenseId,
    ALICE,
    submitExpense({ id: "e2", memo: "conference travel", amountCents: 92000 }),
    "submitExpense e2",
  );

  await step(
    reactor,
    expenseId,
    CAROL,
    approveExpense({ id: "e2" }),
    "approveExpense e2 (Carol is NOT on the roster)",
  );

  console.log(
    "\n— Hiring Carol is one operation on the roster. No policy write. —",
  );
  await step(
    reactor,
    rosterId,
    ALICE,
    addMember({ address: CAROL }),
    "addMember(Carol) on the roster",
  );

  await step(
    reactor,
    expenseId,
    CAROL,
    approveExpense({ id: "e2" }),
    "approveExpense e2 (Carol, at the next decision)",
  );

  // ─── Membership is positional ─────────────────────────────────────────
  console.log(
    "\n— Offboarding races an approval. Alice's removal is timestamped",
  );
  console.log(
    "  BEFORE Bob's already-accepted approval, so at that approval's");
  console.log(
    "  position Bob was no longer a reviewer — the verdict flips. —",
  );

  await step(
    reactor,
    expenseId,
    ALICE,
    submitExpense({ id: "e3", memo: "new laptop", amountCents: 210000 }),
    "submitExpense e3",
  );

  const beforeApproval = new Date(Date.now() - 5).toISOString();
  await step(
    reactor,
    expenseId,
    BOB,
    approveExpense({ id: "e3" }),
    "approveExpense e3 (Bob is still on the roster — admitted)",
  );

  const backdated = {
    ...removeMember({ address: BOB }),
    timestampUtcMs: beforeApproval,
  };
  await step(
    reactor,
    rosterId,
    ALICE,
    backdated,
    "removeMember(Bob), timestamped before the approval",
  );

  process.stdout.write("        waiting for re-evaluation");
  for (;;) {
    const verdicts = await globalVerdicts(reactor, expenseId);
    if (verdicts.some((v) => v.type === "APPROVE_EXPENSE" && v.denied)) break;
    process.stdout.write(".");
    await sleep(50);
  }
  console.log(" done");

  console.log("\n=== expense report verdicts (global scope) ===");
  for (const verdict of await globalVerdicts(reactor, expenseId)) {
    console.log(
      `  ${verdict.type.padEnd(16)} ${verdict.denied ? "DENIED" : "applied"}`,
    );
  }

  const finalRoster = await reactor.get<ReactorGroupDocument>(rosterId);
  console.log("\n=== roster (state.global) ===");
  console.log(JSON.stringify(finalRoster.state.global, null, 2));

  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
