/** Asking before writing, in five acts. See the README. */
import {
  AuthEnforcementDisabledError,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type ActionCandidate,
  type IReactor,
  type IReactorClient,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  initializeAuth,
  removeGrant,
  type Grant,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  approveExpense,
  ExpenseReport,
  submitExpense,
  utils as expenseUtils,
} from "document-models/expense-report/v1";

const CLERK = "0xCccCcCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC1";
const MANAGER = "0xMmMmmMMmMmMMMMmmMMmmmmmmMMmmMMmmMmmMmMM2";
const THRESHOLD = 50_000;

const label = (address: string) => (address === CLERK ? "clerk" : "manager");

function policy(): Grant[] {
  return [
    {
      id: "g-manager-admin",
      description: "the manager administers the policy",
      effect: "allow",
      principal: { address: MANAGER },
      capability: { can: "execute", scope: "auth" },
    },
    {
      id: "g-manager-global",
      description: "the manager submits and approves without limit",
      effect: "allow",
      principal: { address: MANAGER },
      capability: { can: "execute", scope: "global" },
    },
    {
      id: "g-clerk-small",
      description: "a clerk submits expenses under the threshold",
      effect: "allow",
      principal: { address: CLERK },
      capability: {
        can: "execute",
        scope: "global",
        operation: ["SUBMIT_EXPENSE"],
      },
      where: {
        lt: [{ attr: "action.input.amountCents" }, { lit: THRESHOLD }],
      },
    },
  ];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
        app: { name: "auth-preflight", key: `did:test:${address}` },
        signatures: [],
      },
    },
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
    await sleep(5);
  }
}

async function attempt(
  reactor: IReactor,
  docId: string,
  caller: string,
  action: Action,
): Promise<"allow" | "deny"> {
  await sleep(10);
  const done = await waitForJob(
    reactor,
    await reactor.execute(docId, "main", [signedBy(action, caller)]),
  );
  return done.status === JobStatus.FAILED ? "deny" : "allow";
}

function describeCandidate(c: ActionCandidate): string {
  const input = c.input as { amountCents?: number } | undefined;
  if (c.type === "SUBMIT_EXPENSE") {
    return input?.amountCents === undefined
      ? "SUBMIT_EXPENSE (no amount yet)"
      : `SUBMIT_EXPENSE $${(input.amountCents / 100).toFixed(2)}`;
  }
  return c.type;
}

function actionFor(c: ActionCandidate): Action {
  return c.type === "SUBMIT_EXPENSE"
    ? submitExpense(c.input as never)
    : approveExpense(c.input as never);
}

async function main() {
  console.log("auth-preflight: ask what the reactor would decide, then submit");
  console.log("═════════════════════════════════════════════════════════════\n");

  process.stdout.write("Starting reactor and client...");
  const t0 = performance.now();
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          ExpenseReport,
          documentModelDocumentModelModule,
        ])
        .withLogger(quietLogger())
        .withExecutorConfig({
          featureFlags: {
            documentDecisions: true,
            authEnforcement: true,
            authGroups: true,
            authConditions: true,
          },
        }),
    )
    .buildModule();
  const reactor: IReactor = module.reactor;
  const client: IReactorClient = module.client;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  const document = expenseUtils.createDocument();
  const expenseId = document.header.id;
  await waitForJob(reactor, await reactor.create(document));
  await attempt(
    reactor,
    expenseId,
    MANAGER,
    initializeAuth({ version: 1, grants: policy() }),
  );
  console.log(`Expense report ${expenseId.slice(0, 8)} is governed by a policy:`);
  console.log("  the manager may do anything in the global scope");
  console.log(
    `  a clerk may SUBMIT_EXPENSE, but only under $${THRESHOLD / 100}\n`,
  );

  console.log("\n─── The prediction matches the submit ───────────────────\n");

  const candidates: ActionCandidate[] = [
    { scope: "global", type: "SUBMIT_EXPENSE", input: { id: "e1", memo: "pens", amountCents: 900 } },
    { scope: "global", type: "SUBMIT_EXPENSE", input: { id: "e2", memo: "laptop", amountCents: 250_000 } },
    { scope: "global", type: "APPROVE_EXPENSE", input: { id: "e1" } },
  ];

  const predicted = await client.evaluateActions(
    expenseId,
    "main",
    candidates,
    { address: CLERK },
  );

  console.log("One call, asked as the clerk, before anything is submitted:\n");
  console.log("  candidate                       predicted   actual");
  console.log("  ─────────────────────────────   ─────────   ──────");
  for (const [i, c] of candidates.entries()) {
    const actual = await attempt(reactor, expenseId, CLERK, actionFor(c));
    const verdict = predicted.evaluations[i];
    const mark = verdict.decision === actual ? "" : "   MISMATCH";
    console.log(
      `  ${describeCandidate(c).padEnd(31)} ${verdict.decision.padEnd(11)} ${actual}${mark}`,
    );
  }
  console.log(
    `\n  Every prediction held. A denial also carries its reason:\n  "${
      predicted.evaluations.find((e) => e.decision === "deny")?.reason ?? ""
    }"`,
  );

  console.log("\n─── The aggregates are what a control asks ──────────────\n");
  console.log(
    `  allAllowed ${predicted.allAllowed}   anyAllowed ${predicted.anyAllowed}` +
      `   allDenied ${predicted.allDenied}   anyDenied ${predicted.anyDenied}`,
  );
  console.log("  A toolbar reads anyAllowed; a form reads allAllowed.");

  console.log("\n─── The input is part of the question ───────────────────\n");
  const amounts = [THRESHOLD - 1, THRESHOLD, undefined];
  const typed: ActionCandidate[] = amounts.map((amountCents, i) => ({
    scope: "global",
    type: "SUBMIT_EXPENSE",
    input:
      amountCents === undefined
        ? undefined
        : { id: `t${i}`, memo: "supplies", amountCents },
  }));
  const asTyped = await client.evaluateActions(expenseId, "main", typed, {
    address: CLERK,
  });
  console.log("  The grant reads action.input.amountCents, so the form's");
  console.log("  current value decides the answer:\n");
  for (const [i, c] of typed.entries()) {
    console.log(
      `  ${describeCandidate(c).padEnd(31)} ${asTyped.evaluations[i].decision}`,
    );
  }

  console.log("\n─── A prediction, not a promise ─────────────────────────\n");
  const small: ActionCandidate[] = [
    { scope: "global", type: "SUBMIT_EXPENSE", input: { id: "e9", memo: "pens", amountCents: 900 } },
  ];
  const beforeChange = await client.evaluateActions(expenseId, "main", small, {
    address: CLERK,
  });
  console.log(`  Asked as the clerk: ${beforeChange.evaluations[0].decision}`);
  console.log("  ...the manager now revokes the clerk's grant...");
  await attempt(reactor, expenseId, MANAGER, removeGrant({ id: "g-clerk-small" }));
  const outcome = await attempt(
    reactor,
    expenseId,
    CLERK,
    submitExpense({ id: "e9", memo: "pens", amountCents: 900 }),
  );
  console.log(`  ...and the very same submit is: ${outcome}`);
  console.log(
    "\n  The answer was right when it was given and wrong when it was used.\n" +
      "  The submit path stays the only authority; a preflight only decides\n" +
      "  whether the control was worth offering.",
  );

  console.log("\n─── Unsupported is not denied ───────────────────────────\n");
  const bare = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          ExpenseReport,
          documentModelDocumentModelModule,
        ])
        .withLogger(quietLogger()),
    )
    .buildModule();
  try {
    await bare.client.evaluateActions(expenseId, "main", small, {
      address: CLERK,
    });
    console.log("  (unexpectedly answered)");
  } catch (error) {
    console.log(
      `  A reactor without authEnforcement throws ${
        AuthEnforcementDisabledError.isError(error) ? error.name : "?"
      }.`,
    );
    console.log(
      "  A caller reads that as 'cannot know' and leaves its controls alone —\n" +
        "  never as a refusal, or every button would go dead wherever\n" +
        "  enforcement is off.",
    );
  }
  bare.reactor.kill();

  console.log("\n═════════════════════════════════════════════════════════════");
  console.log("Ask before you write; still handle the refusal when you do.");

  reactor.kill();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
