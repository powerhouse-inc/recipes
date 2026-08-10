/**
 * One rule, two times. Alice administers an expense report's policy from
 * reactor A; Bob approves expenses from reactor B. A revocation and an
 * approval race — both succeed locally, because no transaction spans two
 * reactors. What keeps the fleet honest is that every reactor judges
 * every operation at its POSITION in the merged order:
 *
 *   race 1: the revocation sorts before the approval
 *           → after sync, BOTH reactors deny the approval
 *   race 2: the approval sorts before the revocation
 *           → after sync, BOTH reactors keep it
 *
 * Same operation, opposite verdicts, decided purely by position — no
 * origin verdict is shipped or trusted. A refused operation is stored
 * with deniedReason "no grant permits this operation", never dropped.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  garbageCollect,
  initializeAuth,
  isDenied,
  removeGrant,
  setGrant,
  sortOperations,
  type Grant,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger, Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  approveExpense,
  ExpenseReport,
  submitExpense,
  utils,
  type ExpenseReportDocument,
} from "document-models/expense-report/v1";

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

const GRANT_ANYONE_SUBMIT: Grant = {
  id: "g-anyone-submit",
  description: "anyone may submit expenses",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global", operation: ["SUBMIT_EXPENSE"] },
};

const GRANT_BOB_APPROVE: Grant = {
  id: "g-bob-approve",
  description: "Bob may approve expenses",
  effect: "allow",
  principal: { address: BOB },
  capability: { can: "execute", scope: "global", operation: ["APPROVE_EXPENSE"] },
};

function label(address: string): string {
  return address === ALICE ? "Alice@A" : "Bob@B";
}

function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "revocation-race-demo", key: `did:demo:${address}` },
        signatures: [],
      },
    },
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Refusals are the point of this demo; keep the reactor's error channel quiet. */
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

async function buildReactor(): Promise<IReactor> {
  return new ReactorBuilder()
    .withDocumentModelSources([ExpenseReport, documentModelDocumentModelModule])
    .withLogger(quietLogger())
    .withExecutorConfig({
      featureFlags: { documentDecisions: true, authEnforcement: true },
    })
    .build();
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
  await sleep(15); // give every operation its own millisecond
  const job = await reactor.execute(docId, "main", [signedBy(action, caller)]);
  const done = await waitForJob(reactor, job);
  if (done.status === JobStatus.FAILED) {
    console.log(`[${label(caller)}] ${description}`);
    console.log(`        → refused: ${done.error?.message ?? "job failed"}`);
  } else {
    console.log(`[${label(caller)}] ${description} → ok`);
  }
}

async function sync(
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
  await waitForJob(to, await to.load(docId, "main", results));
}

async function syncAll(a: IReactor, b: IReactor, docId: string): Promise<void> {
  for (const scope of ["document", "auth", "global"]) {
    await sync(a, b, docId, scope);
    await sync(b, a, docId, scope);
  }
}

async function printVerdicts(
  name: string,
  reactor: IReactor,
  docId: string,
): Promise<void> {
  const ops = await reactor.getOperations(docId, {
    branch: "main",
    scopes: ["global"],
  });
  const effective = garbageCollect(
    sortOperations([...(ops.global?.results ?? [])] as Operation[]),
  );
  console.log(`  ${name}:`);
  for (const operation of effective) {
    const input = operation.action.input as { id: string };
    const verdict = isDenied(operation)
      ? `DENIED (${operation.deniedReason})`
      : "applied";
    console.log(
      `    ${operation.action.type} ${input.id} → ${verdict}`,
    );
  }
}

async function main() {
  console.log("revocation-race: convergent authorization");
  console.log("═══════════════════════════════════════════\n");

  process.stdout.write(
    "Starting two reactors (documentDecisions + authEnforcement)...",
  );
  const reactorA = await buildReactor();
  const reactorB = await buildReactor();
  console.log(" done\n");

  const document = utils.createDocument();
  const docId = document.header.id;
  await waitForJob(reactorA, await reactorA.create(document));

  await step(
    reactorA,
    docId,
    ALICE,
    initializeAuth({
      version: 1,
      grants: [
        GRANT_ALICE_ADMIN,
        GRANT_ALICE_ALL,
        GRANT_ANYONE_SUBMIT,
        GRANT_BOB_APPROVE,
      ],
    }),
    "initializeAuth — Bob may approve expenses",
  );
  await step(
    reactorA,
    docId,
    ALICE,
    submitExpense({ id: "e-lunch", memo: "team lunch", amountCents: 4800 }),
    "submitExpense e-lunch ($48.00)",
  );
  await syncAll(reactorA, reactorB, docId);
  console.log("        (synced — both reactors agree)\n");

  console.log("— race 1: the revocation sorts before the approval —");
  await step(
    reactorA,
    docId,
    ALICE,
    removeGrant({ id: GRANT_BOB_APPROVE.id }),
    "removeGrant g-bob-approve (B doesn't know yet)",
  );
  await step(
    reactorB,
    docId,
    BOB,
    approveExpense({ id: "e-lunch" }),
    "approveExpense e-lunch (A doesn't know yet)",
  );
  await syncAll(reactorA, reactorB, docId);
  console.log("  after sync, both reactors judge the approval at its position:");
  await printVerdicts("reactor A", reactorA, docId);
  await printVerdicts("reactor B", reactorB, docId);

  const afterRace1 = await reactorA.get<ExpenseReportDocument>(docId);
  const lunch = afterRace1.state.global.expenses.find(
    (expense) => expense.id === "e-lunch",
  );
  console.log(`  e-lunch status: ${lunch?.status}\n`);

  console.log("— race 2: the approval sorts before the revocation —");
  await step(
    reactorA,
    docId,
    ALICE,
    setGrant({ grant: GRANT_BOB_APPROVE }),
    "setGrant g-bob-approve (re-granted)",
  );
  await step(
    reactorA,
    docId,
    ALICE,
    submitExpense({
      id: "e-travel",
      memo: "conference travel",
      amountCents: 92000,
    }),
    "submitExpense e-travel ($920.00)",
  );
  await syncAll(reactorA, reactorB, docId);

  await step(
    reactorB,
    docId,
    BOB,
    approveExpense({ id: "e-travel" }),
    "approveExpense e-travel (while still granted)",
  );
  await step(
    reactorA,
    docId,
    ALICE,
    removeGrant({ id: GRANT_BOB_APPROVE.id }),
    "removeGrant g-bob-approve (too late for e-travel)",
  );
  await syncAll(reactorA, reactorB, docId);
  console.log("  after sync:");
  await printVerdicts("reactor A", reactorA, docId);
  await printVerdicts("reactor B", reactorB, docId);

  const afterRace2 = await reactorA.get<ExpenseReportDocument>(docId);
  const travel = afterRace2.state.global.expenses.find(
    (expense) => expense.id === "e-travel",
  );
  console.log(
    `  e-travel status: ${travel?.status} (approvedBy ${travel?.approvedBy})\n`,
  );

  // Positional judgment only works if the policy stream itself has one
  // authoritative order: auth operations must be strictly newer than the
  // auth head, and are never reshuffled.
  const backdated = {
    ...setGrant({ grant: GRANT_BOB_APPROVE }),
    timestampUtcMs: new Date(Date.now() - 60_000).toISOString(),
  };
  await step(
    reactorA,
    docId,
    ALICE,
    backdated,
    "setGrant backdated by a minute (auth stream is strictly monotonic)",
  );

  reactorA.kill();
  reactorB.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
