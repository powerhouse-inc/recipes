/**
 * Walks the platform ACL surface on a single reactor with the cascading
 * feature flags enabled (documentDecisions → authEnforcement):
 *
 *   1. an uninitialized policy leaves the document open
 *   2. initializing the policy flips the default to deny
 *   3. capabilities cover exact operation lists
 *   4. the auth scope itself is just another scope a grant can cover
 *   5. grants stack — the last applicable grant wins, and moveGrant
 *      changes the outcome without changing any grant
 *
 * The team-journal reducers contain no authorization code. Every refusal
 * below happens at admission, before any reducer runs.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  initializeAuth,
  moveGrant,
  removeGrant,
  setGrant,
  type Grant,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  addEntry,
  pinEntry,
  setTitle,
  TeamJournal,
  utils,
  type TeamJournalDocument,
} from "document-models/team-journal/v1";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";

// The policy the demo installs. Evaluation is default-deny with the last
// applicable grant winning, so order matters — which step 11 exploits.
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

const GRANT_ANYONE_ADD: Grant = {
  id: "g-anyone-add",
  description: "anyone may add entries",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global", operation: ["ADD_ENTRY"] },
};

const GRANT_DENY_BOB: Grant = {
  id: "g-deny-bob",
  description: "Bob may not add entries",
  effect: "deny",
  principal: { address: BOB },
  capability: { can: "execute", scope: "global", operation: ["ADD_ENTRY"] },
};

function label(address: string): string {
  return address === ALICE ? "Alice" : address === BOB ? "Bob" : address;
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
        app: { name: "document-acl-demo", key: `did:demo:${label(address)}` },
        signatures: [],
      },
    },
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * This demo refuses jobs on purpose, and the reactor logs every failed job
 * at error level with the full job payload. The step output already
 * narrates each refusal, so keep the reactor quiet.
 */
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

async function main() {
  console.log("document-acl: platform-enforced ACLs");
  console.log("═════════════════════════════════════\n");

  process.stdout.write("Starting reactor (documentDecisions + authEnforcement)...");
  const t0 = performance.now();
  const reactorModule = await new ReactorBuilder()
    .withDocumentModelSources([TeamJournal, documentModelDocumentModelModule])
    .withLogger(quietLogger())
    .withExecutorConfig({
      featureFlags: { documentDecisions: true, authEnforcement: true },
    })
    .buildModule();
  const reactor: IReactor = reactorModule.reactor;
  console.log(` done (${((performance.now() - t0) / 1000).toFixed(1)}s)\n`);

  const document = utils.createDocument();
  const docId = document.header.id;
  await waitForJob(reactor, await reactor.create(document));
  console.log(`[Alice] created journal ${docId} — no policy yet\n`);

  await step(
    reactor,
    docId,
    BOB,
    addEntry({ id: "e-open", text: "first!" }),
    "addEntry before any policy (uninitialized policy = open document)",
  );

  await step(
    reactor,
    docId,
    ALICE,
    initializeAuth({
      version: 1,
      grants: [GRANT_ALICE_ADMIN, GRANT_ALICE_ALL, GRANT_ANYONE_ADD],
    }),
    "initializeAuth — 3 grants; the default is now deny",
  );

  await step(
    reactor,
    docId,
    BOB,
    addEntry({ id: "e-covered", text: "still allowed to add" }),
    "addEntry (covered by the anyone/ADD_ENTRY grant)",
  );

  await step(
    reactor,
    docId,
    BOB,
    setTitle({ title: "Bob's journal now" }),
    "setTitle (no grant covers SET_TITLE for Bob)",
  );

  await step(
    reactor,
    docId,
    BOB,
    pinEntry({ id: "e-covered" }),
    "pinEntry (operation lists are exact: ADD_ENTRY ≠ PIN_ENTRY)",
  );

  await step(
    reactor,
    docId,
    ALICE,
    pinEntry({ id: "e-covered" }),
    "pinEntry (Alice's scope-* grant covers it)",
  );

  await step(
    reactor,
    docId,
    BOB,
    setGrant({
      grant: {
        id: "g-bob-self-service",
        description: "Bob grants himself everything",
        effect: "allow",
        principal: { address: BOB },
        capability: { can: "execute", scope: "*" },
      },
    }),
    "setGrant — Bob tries to grant himself access (auth scope is Alice-only)",
  );

  await step(
    reactor,
    docId,
    ALICE,
    setGrant({ grant: GRANT_DENY_BOB }),
    "setGrant — deny Bob ADD_ENTRY, appended after the anyone-allow",
  );

  await step(
    reactor,
    docId,
    BOB,
    addEntry({ id: "e-denied", text: "am I still welcome?" }),
    "addEntry (the deny sits after the allow — last applicable grant wins)",
  );

  await step(
    reactor,
    docId,
    ALICE,
    moveGrant({ id: GRANT_DENY_BOB.id, index: 0 }),
    "moveGrant — move the deny to index 0, before the anyone-allow",
  );

  await step(
    reactor,
    docId,
    BOB,
    addEntry({ id: "e-reordered", text: "order decides, not existence" }),
    "addEntry (same grants, new order — the later allow now wins)",
  );

  await step(
    reactor,
    docId,
    ALICE,
    removeGrant({ id: GRANT_DENY_BOB.id }),
    "removeGrant — retire the deny entirely",
  );

  const finalDoc = await reactor.get<TeamJournalDocument>(docId);
  console.log("\n=== final journal (state.global) ===");
  console.log(JSON.stringify(finalDoc.state.global, null, 2));
  console.log("\n=== policy (state.auth — replicated like any other state) ===");
  console.log(
    JSON.stringify(
      finalDoc.state.auth.grants.map((grant) => ({
        id: grant.id,
        effect: grant.effect,
        principal: grant.principal,
        capability: grant.capability,
      })),
      null,
      2,
    ),
  );

  reactor.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
