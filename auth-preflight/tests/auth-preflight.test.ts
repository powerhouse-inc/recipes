/**
 * The authorization preflight end to end: one call predicts a verdict for a
 * batch of candidate operations, the prediction matches what the submit then
 * does, the candidate's own input is part of the question, and the answer goes
 * stale the moment the policy moves — because it is a prediction, not a promise.
 */
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
  AUTH_NO_GRANT_REASON,
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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLERK = "0xCccCcCcCCCcCcccCCccCcCccCCCCccCCcCCcCcC1";
const MANAGER = "0xMmMmmMMmMmMMMMmmMMmmmmmmMMmmMMmmMmmMmMM2";
const OUTSIDER = "0xOoOooOOoOoOOOOooOOooooooOOooOOooOoooOoO3";

/** Anything at or above this needs a manager; below it a clerk may self-serve. */
const APPROVAL_THRESHOLD_CENTS = 50_000;

const ALL_FLAGS = {
  documentDecisions: true,
  authEnforcement: true,
  authGroups: true,
  authConditions: true,
};

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
        lt: [
          { attr: "action.input.amountCents" },
          { lit: APPROVAL_THRESHOLD_CENTS },
        ],
      },
    },
  ];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Refusals are the subject matter here; keep the error channel quiet. */
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
        app: { name: "auth-preflight-test", key: `did:test:${address}` },
        signatures: [],
      },
    },
  };
}

type Vault = { reactor: IReactor; client: IReactorClient };

async function boot(flags: Partial<typeof ALL_FLAGS>): Promise<Vault> {
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          ExpenseReport,
          documentModelDocumentModelModule,
        ])
        .withLogger(quietLogger())
        .withExecutorConfig({ featureFlags: flags }),
    )
    .buildModule();
  return { reactor: module.reactor, client: module.client };
}

async function settle(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
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

/** Submits for real and reports which way the reactor actually went. */
async function attempt(
  reactor: IReactor,
  docId: string,
  caller: string,
  action: Action,
): Promise<"allow" | "deny"> {
  await sleep(10); // every operation gets its own millisecond
  const done = await settle(
    reactor,
    await reactor.execute(docId, "main", [signedBy(action, caller)]),
  );
  return done.status === JobStatus.FAILED ? "deny" : "allow";
}

/** Submits and insists it lands, for fixture setup. */
async function execute(
  reactor: IReactor,
  docId: string,
  caller: string,
  action: Action,
): Promise<void> {
  const outcome = await attempt(reactor, docId, caller, action);
  if (outcome === "deny") throw new Error(`refused: ${action.type}`);
}

function candidate(
  type: string,
  input?: unknown,
  scope = "global",
): ActionCandidate {
  return { scope, type, input };
}

async function policied(vault: Vault, extra: Grant[] = []): Promise<string> {
  const document = expenseUtils.createDocument();
  await settle(vault.reactor, await vault.reactor.create(document));
  await execute(
    vault.reactor,
    document.header.id,
    MANAGER,
    initializeAuth({ version: 1, grants: [...policy(), ...extra] }),
  );
  return document.header.id;
}

/** Lets the manager delete this particular document. */
const deletableByManager: Grant = {
  id: "g-manager-document",
  description: "the manager may write this document's own scope",
  effect: "allow",
  principal: { address: MANAGER },
  capability: { can: "execute", scope: "document" },
};

describe("the authorization preflight", () => {
  let vault: Vault;
  let expenseId: string;

  beforeEach(async () => {
    vault = await boot(ALL_FLAGS);
    expenseId = await policied(vault);
  });

  afterEach(() => {
    vault.reactor.kill();
  });

  /**
   * The claim the whole API rests on. Everything else is detail; if a
   * prediction and a submit can disagree, a UI built on this lies to its user.
   */
  it("predicts, for each candidate, what the submit then does", async () => {
    const candidates = [
      candidate("SUBMIT_EXPENSE", { id: "e1", memo: "pens", amountCents: 900 }),
      candidate("SUBMIT_EXPENSE", {
        id: "e2",
        memo: "laptop",
        amountCents: 250_000,
      }),
      candidate("APPROVE_EXPENSE", { id: "e1" }),
    ];

    const predicted = await vault.client.evaluateActions(
      expenseId,
      "main",
      candidates,
      { address: CLERK },
    );

    const actual: Array<"allow" | "deny"> = [];
    for (const c of candidates) {
      const action =
        c.type === "SUBMIT_EXPENSE"
          ? submitExpense(c.input as never)
          : approveExpense(c.input as never);
      actual.push(await attempt(vault.reactor, expenseId, CLERK, action));
    }

    expect(predicted.evaluations.map((e) => e.decision)).toEqual(actual);
    expect(actual).toEqual(["allow", "deny", "deny"]);
  });

  it("names the reason a refusal would be recorded with", async () => {
    const answer = await vault.client.evaluateActions(
      expenseId,
      "main",
      [candidate("APPROVE_EXPENSE", { id: "e1" })],
      { address: OUTSIDER },
    );

    expect(answer.evaluations).toEqual([
      { decision: "deny", reason: AUTH_NO_GRANT_REASON },
    ]);
  });

  /**
   * A toolbar asks "may I offer any of this?", a form asks "may I offer all of
   * it?". Both are answered without the caller reducing the list itself.
   */
  it("aggregates the batch the way a control would ask about it", async () => {
    const mixed = await vault.client.evaluateActions(
      expenseId,
      "main",
      [
        candidate("SUBMIT_EXPENSE", { id: "e1", memo: "pens", amountCents: 10 }),
        candidate("APPROVE_EXPENSE", { id: "e1" }),
      ],
      { address: CLERK },
    );

    expect(mixed).toMatchObject({
      allAllowed: false,
      anyAllowed: true,
      allDenied: false,
      anyDenied: true,
    });

    // Nothing asked about is nothing allowed and nothing denied. A caller
    // branching on allAllowed must not read an empty batch as permission.
    const empty = await vault.client.evaluateActions(expenseId, "main", [], {
      address: CLERK,
    });
    expect(empty).toEqual({
      evaluations: [],
      allAllowed: false,
      anyAllowed: false,
      allDenied: false,
      anyDenied: false,
    });
  });

  /** One client, many principals: the subject is asked about, not assumed. */
  it("answers for the subject it is given", async () => {
    const approve = [candidate("APPROVE_EXPENSE", { id: "e1" })];

    const asManager = await vault.client.evaluateActions(
      expenseId,
      "main",
      approve,
      { address: MANAGER },
    );
    const asClerk = await vault.client.evaluateActions(
      expenseId,
      "main",
      approve,
      { address: CLERK },
    );

    expect(asManager.allAllowed).toBe(true);
    expect(asClerk.allDenied).toBe(true);
  });

  /**
   * The grant reads `action.input.amountCents`, so the amount is part of the
   * question rather than context around it. This is what makes a submit button
   * that enables as the user types a smaller number correct rather than lucky.
   */
  it("reads the candidate's own input when the grant depends on it", async () => {
    const answer = await vault.client.evaluateActions(
      expenseId,
      "main",
      [
        candidate("SUBMIT_EXPENSE", {
          id: "e1",
          memo: "pens",
          amountCents: APPROVAL_THRESHOLD_CENTS - 1,
        }),
        candidate("SUBMIT_EXPENSE", {
          id: "e2",
          memo: "laptop",
          amountCents: APPROVAL_THRESHOLD_CENTS,
        }),
        candidate("SUBMIT_EXPENSE"),
      ],
      { address: CLERK },
    );

    expect(answer.evaluations.map((e) => e.decision)).toEqual([
      "allow",
      "deny",
      "deny",
    ]);
  });

  /**
   * A delete names its target in the input, and the executor decides it against
   * that document's policy. Deciding against the document the call named would
   * let a caller ask about one it controls to be told it may delete one it does
   * not.
   */
  it("decides a document-scope candidate against the document it names", async () => {
    const deletable = await policied(vault, [deletableByManager]);

    // Both asked through `expenseId`, which is NOT deletable. If the target in
    // the input were ignored, both would come back denied together; the split
    // verdict is what shows each was judged by the policy of the document it
    // names rather than the one the call was addressed to.
    const answer = await vault.client.evaluateActions(
      expenseId,
      "main",
      [
        candidate("DELETE_DOCUMENT", { documentId: deletable }, "document"),
        candidate("DELETE_DOCUMENT", { documentId: expenseId }, "document"),
      ],
      { address: MANAGER },
    );

    expect(answer.evaluations.map((e) => e.decision)).toEqual([
      "allow",
      "deny",
    ]);
  });

  /**
   * The honest centrepiece. The answer was right when it was given and wrong by
   * the time it was used, because a policy landed in between. The submit path
   * stays the only authority.
   */
  it("goes stale when the policy moves under it", async () => {
    const submit = [
      candidate("SUBMIT_EXPENSE", { id: "e1", memo: "pens", amountCents: 900 }),
    ];

    const before = await vault.client.evaluateActions(
      expenseId,
      "main",
      submit,
      { address: CLERK },
    );
    expect(before.allAllowed).toBe(true);

    await execute(
      vault.reactor,
      expenseId,
      MANAGER,
      removeGrant({ id: "g-clerk-small" }),
    );

    const outcome = await attempt(
      vault.reactor,
      expenseId,
      CLERK,
      submitExpense({ id: "e1", memo: "pens", amountCents: 900 }),
    );

    expect(outcome).toBe("deny");
    const after = await vault.client.evaluateActions(
      expenseId,
      "main",
      submit,
      { address: CLERK },
    );
    expect(after.allDenied).toBe(true);
  });
});

/**
 * Below authEnforcement the reactor holds no decision model, so there is no
 * verdict to give. Reading that as a denial would grey out every control on a
 * deployment that never asked for enforcement.
 */
describe("a reactor without authEnforcement", () => {
  let vault: Vault;

  beforeEach(async () => {
    vault = await boot({});
  });

  afterEach(() => {
    vault.reactor.kill();
  });

  it("refuses to answer rather than answering 'denied'", async () => {
    const document = expenseUtils.createDocument();
    await settle(vault.reactor, await vault.reactor.create(document));

    const asking = vault.client.evaluateActions(
      document.header.id,
      "main",
      [candidate("SUBMIT_EXPENSE", { id: "e1", memo: "pens", amountCents: 10 })],
      { address: CLERK },
    );

    await expect(asking).rejects.toThrow(AuthEnforcementDisabledError);

    // Detection is by name: the class identity does not survive the worker RPC
    // boundary a browser client sits behind.
    const error: unknown = await asking.then(
      (answer) => answer,
      (caught: unknown) => caught,
    );
    expect(AuthEnforcementDisabledError.isError(error)).toBe(true);
  });
});
