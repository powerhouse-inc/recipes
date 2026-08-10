/**
 * Admission-level enforcement of the auth scope, end to end against a real
 * reactor with documentDecisions + authEnforcement enabled. None of the
 * behavior asserted here exists in the team-journal reducers — every
 * refusal comes from the platform evaluating the grant stack.
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Denials are expected here; keep the reactor's error channel quiet. */
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
        app: { name: "document-acl-tests", key: `did:test:${address}` },
        signatures: [],
      },
    },
  };
}

describe("platform-enforced document ACLs", () => {
  let reactor: IReactor;
  let docId: string;

  async function settle(job: JobInfo): Promise<void> {
    for (;;) {
      const status = await reactor.getJobStatus(job.id);
      if (status.status === JobStatus.READ_READY) return;
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message ?? "job failed");
      }
      await sleep(5);
    }
  }

  async function execute(caller: string, action: Action): Promise<void> {
    // The auth stream must be strictly timestamp-monotonic, so give every
    // action its own millisecond.
    await sleep(10);
    await settle(
      await reactor.execute(docId, "main", [signedBy(action, caller)]),
    );
  }

  async function initializePolicy(grants: Grant[]): Promise<void> {
    await execute(ALICE, initializeAuth({ version: 1, grants }));
  }

  async function readJournal(): Promise<TeamJournalDocument> {
    return reactor.get<TeamJournalDocument>(docId);
  }

  beforeEach(async () => {
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([
        TeamJournal,
        documentModelDocumentModelModule,
      ])
      .withLogger(quietLogger())
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement: true },
      })
      .build();

    const document = utils.createDocument();
    docId = document.header.id;
    await settle(await reactor.create(document));
  });

  afterEach(() => {
    reactor.kill();
  });

  it("leaves the document open until the policy is initialized", async () => {
    await execute(BOB, addEntry({ id: "e1", text: "no policy yet" }));

    const journal = await readJournal();
    expect(journal.state.global.entries).toHaveLength(1);
    expect(journal.state.global.entries[0].author).toBe(BOB);
  });

  it("denies by default once the policy is initialized", async () => {
    await initializePolicy([GRANT_ALICE_ADMIN, GRANT_ALICE_ALL]);

    await expect(
      execute(BOB, setTitle({ title: "Bob's journal now" })),
    ).rejects.toThrow(/Authorization denied.*SET_TITLE/);

    // The refusal happened at admission: nothing was stored, the reducer
    // never ran.
    const journal = await readJournal();
    expect(journal.state.global.title).toBe("");
    const operations = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    expect(operations.global?.results ?? []).toHaveLength(0);
  });

  it("covers exact operation lists, not whole scopes", async () => {
    await initializePolicy([
      GRANT_ALICE_ADMIN,
      GRANT_ALICE_ALL,
      GRANT_ANYONE_ADD,
    ]);

    await execute(BOB, addEntry({ id: "e1", text: "allowed" }));
    await expect(execute(BOB, pinEntry({ id: "e1" }))).rejects.toThrow(
      /Authorization denied.*PIN_ENTRY/,
    );

    const journal = await readJournal();
    expect(journal.state.global.entries).toHaveLength(1);
    expect(journal.state.global.entries[0].pinned).toBe(false);
  });

  it("locks policy administration to the granted principals", async () => {
    await initializePolicy([GRANT_ALICE_ADMIN, GRANT_ANYONE_ADD]);

    await expect(
      execute(
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
      ),
    ).rejects.toThrow(/Authorization denied.*SET_GRANT.*"auth"/);

    // Alice, who holds the auth-scope grant, can.
    await execute(
      ALICE,
      setGrant({
        grant: {
          id: "g-bob-title",
          description: "Bob may set the title",
          effect: "allow",
          principal: { address: BOB },
          capability: { can: "execute", scope: "global", operation: ["SET_TITLE"] },
        },
      }),
    );
    await execute(BOB, setTitle({ title: "granted by Alice" }));

    const journal = await readJournal();
    expect(journal.state.global.title).toBe("granted by Alice");
  });

  it("applies the last applicable grant, so moveGrant changes the verdict", async () => {
    await initializePolicy([
      GRANT_ALICE_ADMIN,
      GRANT_ALICE_ALL,
      GRANT_ANYONE_ADD,
    ]);

    // Appended after the anyone-allow: the deny is now last and wins.
    await execute(ALICE, setGrant({ grant: GRANT_DENY_BOB }));
    await expect(
      execute(BOB, addEntry({ id: "e-denied", text: "?" })),
    ).rejects.toThrow(/Authorization denied.*ADD_ENTRY/);

    // Same grants, new order: the anyone-allow is later again and wins.
    await execute(ALICE, moveGrant({ id: GRANT_DENY_BOB.id, index: 0 }));
    await execute(BOB, addEntry({ id: "e-allowed", text: "order decides" }));

    const journal = await readJournal();
    expect(journal.state.global.entries.map((entry) => entry.id)).toEqual([
      "e-allowed",
    ]);
  });

  it("refuses an initial policy that cannot administer itself", async () => {
    // This document was created without a signing key, so there is no
    // creator carve-out: the initial grants themselves must permit
    // execute on the auth scope somewhere. The guardrail is a reducer
    // error, so the job settles and the refusal lands on the operation.
    await initializePolicy([GRANT_ANYONE_ADD]);

    const operations = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(operations.auth.results).toHaveLength(1);
    expect(operations.auth.results[0].error).toMatch(
      /no reachable grant permitting execute on the auth scope/,
    );

    // The policy never took effect: the document is still open.
    const journal = await readJournal();
    expect(journal.state.auth.version).toBe(0);
    await execute(BOB, addEntry({ id: "e1", text: "still open" }));
  });
});
