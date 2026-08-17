/** The read path of the auth scope, in six acts. See the README. */
import {
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactor,
  type IReactorClient,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  addMember,
  ReactorGroup,
  removeMember,
  utils as groupUtils,
} from "@powerhousedao/reactor-group/document-models/reactor-group";
import {
  initializeAuth,
  type Grant,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  addReviewNote,
  ExpenseReport,
  submitExpense,
  utils as expenseUtils,
} from "document-models/expense-report/v1";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC2";
const MALLORY = "0xDDdddDdDDDdDdddDDddDdDddDDDDddDDdDDdDdD3";

function label(address: string): string {
  const names: Record<string, string> = {
    [ALICE]: "Alice",
    [BOB]: "Bob",
    [CAROL]: "Carol",
    [MALLORY]: "Mallory",
  };
  return names[address] ?? address;
}

/** Every view in the demo follows from this grant list. */
function expensePolicy(rosterId: string): Grant[] {
  return [
    {
      // Scoped to `auth`, not "*": an allow on execute now confers read.
      id: "g-alice-admin",
      description: "Alice administers the policy",
      effect: "allow",
      principal: { address: ALICE },
      capability: { can: "execute", scope: "auth" },
    },
    {
      // Alice holds no read grant; this is what lets her read `global`.
      id: "g-alice-submit",
      description: "Alice submits expenses",
      effect: "allow",
      principal: { address: ALICE },
      capability: {
        can: "execute",
        scope: "global",
        operation: ["SUBMIT_EXPENSE"],
      },
    },
    {
      id: "g-carol-read",
      description: "Carol reads the expenses",
      effect: "allow",
      principal: { address: CAROL },
      capability: { can: "read", scope: "global" },
    },
    {
      // Whoever the roster says is a reviewer, at the position of the read.
      id: "g-reviewers-read",
      description: "reviewers read the expenses",
      effect: "allow",
      principal: { group: rosterId },
      capability: { can: "read", scope: "global" },
    },
    {
      id: "g-reviewers-notes",
      description: "reviewers write the confidential notes",
      effect: "allow",
      principal: { group: rosterId },
      capability: { can: "execute", scope: "local" },
    },
  ];
}

/** The roster governs itself, and serves nobody but Alice. */
function rosterPolicy(): Grant[] {
  return [
    {
      id: "g-alice-roster",
      description: "Alice administers the roster",
      effect: "allow",
      principal: { address: ALICE },
      capability: { can: "execute", scope: "*" },
    },
  ];
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

/** A client reads and writes as whoever its signer names. */
function signerFor(address: string): ISigner {
  return {
    user: { address, networkId: "eip155", chainId: 1 },
    app: { name: "scoped-reads-demo", key: `did:demo:${label(address)}` },
    publicKey: {} as CryptoKey,
    sign: () => Promise.resolve(new Uint8Array(0)),
    verify: () => Promise.resolve(),
    signAction: () => Promise.resolve(["", "", "", "", ""] as never),
  } as ISigner;
}

/** Attaches signer context the way a signing client would. */
function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "scoped-reads-demo", key: `did:demo:${label(address)}` },
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
  // The auth stream must be strictly timestamp-monotonic.
  await sleep(15);
  const job = await reactor.execute(docId, "main", [signedBy(action, caller)]);
  const done = await waitForJob(reactor, job);
  console.log(
    done.status === JobStatus.FAILED
      ? `[${label(caller)}] ${description}\n        -> refused: ${done.error?.message ?? "job failed"}`
      : `[${label(caller)}] ${description} -> ok`,
  );
}

/** The expenses a gated read served, if that scope came back at all. */
function expensesIn(document: PHDocument): unknown[] {
  const state = document.state as unknown as {
    global?: { expenses: unknown[] };
  };
  return state.global?.expenses ?? [];
}

async function scopesFor(
  client: IReactorClient,
  documentId: string,
  address: string,
): Promise<string[]> {
  const document = await client.get(documentId, { subject: { address } });
  return Object.keys(document.state).sort();
}

function printViews(views: Array<[string, string[]]>): void {
  for (const [name, scopes] of views) {
    console.log(`   ${name.padEnd(9)} ${scopes.join(", ")}`);
  }
}

async function main() {
  console.log("scoped-reads: one policy decides what every read returns");
  console.log("═══════════════════════════════════════════════════════\n");

  process.stdout.write("Starting reactor and client...");
  const t0 = performance.now();
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
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
        }),
    )
    .withSigner(signerFor(ALICE))
    .buildModule();
  const reactor: IReactor = module.reactor;
  const client: IReactorClient = module.client;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  const roster = groupUtils.createDocument();
  const rosterId = roster.header.id;
  await waitForJob(reactor, await reactor.create(roster));
  await step(
    reactor,
    rosterId,
    ALICE,
    initializeAuth({ version: 1, grants: rosterPolicy() }),
    `governs roster ${rosterId.slice(0, 8)} (Alice only)`,
  );
  await step(
    reactor,
    rosterId,
    ALICE,
    addMember({ address: BOB }),
    "adds Bob to the reviewers roster",
  );

  const report = expenseUtils.createDocument();
  const reportId = report.header.id;
  await waitForJob(reactor, await reactor.create(report));
  await step(
    reactor,
    reportId,
    ALICE,
    initializeAuth({ version: 1, grants: expensePolicy(rosterId) }),
    `governs expense report ${reportId.slice(0, 8)}`,
  );
  await step(
    reactor,
    reportId,
    ALICE,
    submitExpense({ id: "e-1", memo: "Taxi to the airport", amountCents: 4200 }),
    "submits an expense",
  );
  await step(
    reactor,
    reportId,
    BOB,
    addReviewNote({ expenseId: "e-1", note: "Receipt looks altered." }),
    "records a confidential review note",
  );

  console.log("\n─── The gate is on the client, not the reactor ──────────\n");
  const raw = await reactor.getByIdOrSlug<PHDocument>(reportId);
  console.log("   reactor.get() serves everything, to anyone:");
  console.log(`   ${Object.keys(raw.state).sort().join(", ")}`);
  console.log("\n   client.get() serves what the policy allows:");
  printViews([["Mallory", await scopesFor(client, reportId, MALLORY)]]);
  console.log("\n   Same process, same document. IReactor is inside the trust");
  console.log("   boundary; the client is the door.");


  console.log("\n─── One document, four identities ───────────────────────\n");
  printViews([
    ["Alice", await scopesFor(client, reportId, ALICE)],
    ["Bob", await scopesFor(client, reportId, BOB)],
    ["Carol", await scopesFor(client, reportId, CAROL)],
    ["Mallory", await scopesFor(client, reportId, MALLORY)],
  ]);
  const mallory = await client.get(reportId, { subject: { address: MALLORY } });
  console.log(
    `\n   A withheld scope is absent, not empty: "global" in state -> ${
      "global" in mallory.state
    }`,
  );
  console.log("   auth and document are served to everyone, so any holder can");
  console.log("   still evaluate the policy and read the metadata.");

  console.log("\n─── An allow on execute confers read ────────────────────\n");
  console.log("   Alice holds no read grant. Her only grant on global is");
  console.log("   execute, limited to SUBMIT_EXPENSE -- and she reads the whole");
  console.log("   scope, because the operation list restricts what she may");
  console.log("   execute, not what she may see.");
  const asAlice = await client.get(reportId, { subject: { address: ALICE } });
  console.log(`\n   Alice reads ${expensesIn(asAlice).length} expense(s).`);
  console.log("   Carol reads the same scope through a plain read grant, and");
  console.log("   cannot write it:");
  await step(
    reactor,
    reportId,
    CAROL,
    submitExpense({ id: "e-2", memo: "Carol's dinner", amountCents: 9900 }),
    "submits an expense",
  );

  console.log("\n─── A write hands back a read ───────────────────────────\n");
  const written = await client.execute(reportId, "main", [
    submitExpense({ id: "e-3", memo: "Hotel", amountCents: 18000 }),
  ]);
  console.log("   client.execute() returns the document gated as the client's");
  console.log("   own identity (Alice):");
  console.log(`   ${Object.keys(written.state).sort().join(", ")}`);
  console.log("\n   She sees the scope she wrote, and not the notes her policy");
  console.log("   withholds. Returning it whole would have served exactly what");
  console.log("   her own get() is refused.");

  console.log("\n─── A roster change moves a read, with no policy write ──\n");
  const authBefore = (await client.get(reportId)).header.revision.auth;
  console.log(
    `   Bob reads: ${(await scopesFor(client, reportId, BOB)).join(", ")}`,
  );
  await step(
    reactor,
    rosterId,
    ALICE,
    removeMember({ address: BOB }),
    "offboards Bob from the reviewers roster",
  );
  console.log(
    `   Bob reads: ${(await scopesFor(client, reportId, BOB)).join(", ")}`,
  );
  await step(reactor, rosterId, ALICE, addMember({ address: BOB }), "re-hires Bob");
  console.log(
    `   Bob reads: ${(await scopesFor(client, reportId, BOB)).join(", ")}`,
  );
  const authAfter = (await client.get(reportId)).header.revision.auth;
  console.log(
    `\n   The report's auth stream never moved: revision ${authBefore} -> ${authAfter}`,
  );

  console.log("\n─── Naming a roster publishes it to that audience ───────\n");
  console.log("   The roster's own policy serves nobody but Alice. But a replica");
  console.log("   must fold the membership to evaluate the report's grants, so");
  console.log("   the roster is served to the report's audience:");
  printViews([
    ["Carol", await scopesFor(client, rosterId, CAROL)],
    ["Mallory", await scopesFor(client, rosterId, MALLORY)],
  ]);
  console.log("\n   Carol is not on the roster and still reads it, because the");
  console.log("   report serves her a domain scope. Mallory, whom the report");
  console.log("   serves nothing, does not.");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("The reducers contain no authorization code. Every view above");
  console.log("came from one grant list, evaluated per scope, per identity.");

  reactor.kill();
  process.exit(0);
}

await main();
