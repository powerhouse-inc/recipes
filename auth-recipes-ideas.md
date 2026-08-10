# Authorization recipe ideas: auth-scope + DCB

Ideas for a set of recipes demonstrating the new auth-scope and DCB (decision model /
append-condition) features, driven through the reactor-builder's cascading feature
flags. Each recipe uses a custom document model generated via the codegen pipeline, so
enforcement applies to real domain operations rather than toy actions.

## The surface being demonstrated

Two feature flags have shipped, with a strict prerequisite cascade validated eagerly by
the builder (`packages/reactor/src/core/feature-flags.ts`):

```ts
const reactor = await new ReactorBuilder()
  .withDocumentModelSources([...])
  .withExecutorConfig({
    featureFlags: {
      documentDecisions: true,   // decision model replaces the meta-cache gate
      authEnforcement: true,     // requires documentDecisions
    },
  })
  .build();
```

- **`documentDecisions`** — admission is decided by building a decision model over the
  document stream instead of reading `isDeleted` from the meta cache. Deletion becomes
  *positional*: only operations sorting after the delete are refused, and refused
  operations are stored as denied operations (`deniedReason`) rather than dropped. The
  decision model's read-set becomes an `AppendCondition` passed to
  `IOperationStore.apply`, giving optimistic concurrency (the DCB mechanic).
- **`authEnforcement`** — the decision model gains a second projection over the `auth`
  scope. Policy lives in-document as `PHAuthState` (`{ version, grants, creator }`),
  mutated by four platform actions (`initializeAuth`, `setGrant`, `removeGrant`,
  `moveGrant` from `@powerhousedao/shared/document-model`). Evaluation is default-deny,
  last-applicable-grant-wins, with an uninitialized policy (`version: 0`) leaving the
  document open.

Later stages (`authGroups`, `authConditions`) are not in `FLAG_PREREQUISITES` yet:
grants with a `{ group }` or `{ match }` principal, or a `where` clause, are skipped by
`evaluateGrantStack` today. The recipes below stick to the shipped surface and flag the
future stages as non-goals.

Key exports recipes can lean on (all from `@powerhousedao/reactor` /
`@powerhousedao/shared/document-model`): `ReactorFeatureFlags`, `JobExecutorConfig`,
`buildDecisionModel`, `authDecisionModel`, `documentDecisionModel`, `decideAtHead`,
`AppendCondition`, `AppendConditionFailedError`, `initializeAuth`/`setGrant`/
`removeGrant`/`moveGrant`, `evaluate`, `isDenied`.

A shared gotcha worth documenting once and linking from every recipe: all actions in a
single `reactor.execute(...)` must share one scope (`getSharedActionScope`), so auth
actions cannot be batched with global ones — policy changes are their own execute call.

---

## 1. `document-acl` — grant-stack basics on a custom model

> **Status: implemented** — see [`document-acl/`](./document-acl). One deviation from
> the sketch below: the no-reachable-administration guardrail surfaces as a reducer
> error on the stored operation, not a failed job.

**One-liner:** A custom `team-journal` document model whose write access is governed
entirely by the platform auth scope — no authorization code in any reducer — showing
initialize-then-default-deny, address principals, operation-scoped capabilities, and
last-grant-wins stacking.

**Why.** This is the front door. The existing `role-based-auth` recipe implements RBAC
*inside* reducers; this recipe is its deliberate counterpart: the same outcome achieved
declaratively with zero reducer changes, because enforcement happens at admission. The
pair makes the value proposition legible — the README should contrast them explicitly.

**Document model.** `team-journal`: `addEntry(text)`, `pinEntry(id)`, `setTitle(title)`.
Plain reducers, no signer checks.

**Demo walkthrough (flags: `documentDecisions` + `authEnforcement`):**
1. Alice creates a journal. Policy uninitialized → Bob can write (document is open).
2. Alice dispatches `initializeAuth` with a stack: allow `{anyone}` to
   `{can:"execute", operation:["ADD_ENTRY"]}`; allow `{address: alice}` everything;
   plus an auth-admin grant (required, or initialization throws
   `AuthAdministrationMissingError`).
3. Bob adds an entry (covered), then tries `setTitle` → job fails with
   `AuthorizationDeniedError` and nothing is stored.
4. Alice appends a *deny* grant for Bob on `ADD_ENTRY` — later grant wins, Bob is now
   refused what `{anyone}` allowed. Then `moveGrant` reorders it back below → allowed
   again. This makes stack ordering tangible.
5. `removeGrant` + inspect `document.state.auth` to show policy is ordinary replicated
   state.

**Key references:** grant evaluation `packages/shared/document-model/auth-v1.ts:533`
(`evaluateGrantStack`), capability matching `:489`, error surface
`packages/reactor/src/shared/errors.ts:29`. Test to crib from:
`packages/reactor/test/decision/auth-projection.test.ts:561`.

---

## 2. `auth-flag-rollout` — the cascading flags, and what "off" means

> **Status: dropped** — the cascading flags are temporary rollout machinery, not a
> durable surface worth a recipe. The one enduring lesson (flags flip per
> document-sharing fleet, never per node) is documented in `document-acl`'s README,
> and the flag-off contrast survives as a single "legacy" test in
> `positional-delete`.

**One-liner:** The same document and policy run under three reactor configurations — no
flags, `documentDecisions` only, both flags — showing exactly which behavior each flag
turns on, and the builder rejecting invalid combinations.

**Why.** The flags govern *enforcement only*; the auth data model is always live. That
split is the most misunderstood part of the rollout design: a policy written on one
reactor is silently unenforced on a reactor with the flag off. A recipe that
demonstrates this directly (rather than burying it in a caveat) is the best possible
documentation for why flags flip per document-sharing fleet, never per node.

**Document model.** Reuse `team-journal` from recipe 1 (or a trivial `counter` model to
keep the recipe self-contained).

**Demo walkthrough:**
1. Builder validation first:
   `featureFlags: { authEnforcement: true }` alone → throws
   `"Reactor feature flag authEnforcement requires documentDecisions."`; an unknown
   name (e.g. `authGroups`, not shipped yet) → `"Unrecognized reactor feature flag"`.
   This shows asking an older reactor for a later stage fails loudly instead of
   quietly doing nothing.
2. Write a lockdown policy (deny-all for Bob) into a document, then run Bob's write on
   a flags-off reactor → it lands. Same operations on a flags-on reactor → refused.
3. Show `documentDecisions` alone: deletion becomes positional (see recipe 3) but the
   lockdown policy is still unenforced — each flag adds exactly one layer.

**Key references:** `packages/reactor/src/core/feature-flags.ts:11` (cascade),
`packages/reactor/test/core/feature-flags.test.ts:72` (exact error messages),
`packages/reactor/test/decision/auth-projection.test.ts:515` (unenforced-with-flag-off).

---

## 3. `positional-delete` — deletion as a position, not a tombstone

> **Status: implemented** — see [`positional-delete/`](./positional-delete). Two
> deviations from the sketch below: no backdating is needed (a real split-brain
> gives the same shape with honest wall-clock timestamps), and the as-of-deletion
> view is a load-path guarantee only — a reactor that already applied the tail
> keeps its materialized view, with the effective operation stream as the
> consensus artifact.

**One-liner:** With `documentDecisions` on, a backdated `deleteDocument` arriving via
sync refuses only the operations that sort after it — earlier operations survive,
refused ones are stored as denied operations, and the document view serves state
as-of-deletion.

**Why.** This is the flag's user-visible payoff independent of auth, and the cleanest
introduction to positional evaluation — the machinery auth enforcement then reuses.
Without the flag, a whole load job is rejected when the meta cache says deleted; with
it, verdicts are per-operation at their position in the merged order.

**Document model.** `field-log` (append-only observations: `logObservation(note)`), a
natural fit for "entries before the cutoff are legitimate, entries after are not."

**Demo walkthrough (two reactors, flag on):**
1. Reactor A and B both hold the document. B goes "offline"; A deletes the document at
   time T.
2. B, unaware, logs two observations — one timestamped before T (clock skew /
   backdating), one after.
3. Sync. The pre-T observation is admitted into history; the post-T one is stored with
   `deniedReason: "document deleted"` — inspect with `isDenied(operation)`.
4. Read the document: the view serves the state as of the deletion
   (`servesDeletionBoundary`), not a hole.
5. Run the same sequence with the flag off to show the whole load rejected — the
   before/after contrast is the recipe.

**Key references:** decision branch `packages/reactor/src/executor/simple-job-executor.ts:480`,
denied-op storage `:633`, re-evaluation on late delete `:1169`. Test template:
`packages/reactor/test/decision/positional-deletion.test.ts:100`.

---

## 4. `revocation-race` — convergent enforcement across reactors

**One-liner:** Two reactors race a grant revocation against a write by the revoked
grantee; after sync in both directions, both reactors independently judge the write at
its position in the merged order and converge on the same verdict — no origin-verdict
pinning.

**Why.** This is the deepest property of the DCB-based design: "one rule, two times" —
preventive locally (the append condition includes the auth stream, so a concurrent
policy change fails the append and forces re-decision), convergent across nodes (remote
history is re-judged on arrival, since no transaction spans reactors). It's also the
scenario that distinguishes this design from the obvious alternative of judging once at
origin and shipping the verdict.

**Document model.** `expense-report`: `submitExpense(amount, memo)`,
`approveExpense(id)` — a domain where "was this approval authorized at that point in
history?" reads naturally.

**Demo walkthrough (flags: both; two reactors):**
1. Policy grants Bob `execute` on `APPROVE_EXPENSE`. Both reactors agree.
2. Concurrently: Reactor A revokes Bob's grant (`removeGrant`); Reactor B (Bob)
   approves an expense. Both succeed locally.
3. Sync A→B and B→A. Show both reactors now hold the identical merged order, and Bob's
   approval carries `deniedReason: "no grant permits this operation"` on *both* — the
   revocation sorted before the approval.
4. Rerun with timestamps flipped so the approval sorts first → it stands on both.
5. Sidebar: the auth stream is strictly timestamp-monotonic
   (`AuthTimestampNotMonotonicError`) and auth ops are never reshuffled — demonstrate
   the error once so readers know the invariant exists.

**Key references:** convergence test `packages/reactor/test/decision/convergence.test.ts:190`,
positional evaluation `packages/reactor/src/decision/evaluation.ts:71`, monotonicity
`packages/reactor/test/decision/auth-monotonic.test.ts:101`, denied-reason consensus set
`packages/shared/document-model/denied.ts:19`.

---

## 5. `dcb-invariants` — append conditions as a userland tool

**One-liner:** Use the exported DCB surface directly — `buildDecisionModel` +
`AppendCondition` + `AppendConditionFailedError` — to enforce a cross-stream domain
invariant (seats never oversold) with optimistic concurrency instead of locks.

**Why.** Everything above uses the DCB machinery implicitly through the executor. But
`buildDecisionModel`, the decision-model types, and the append-condition types are all
public exports, which means package authors can build their *own* decision models over
their *own* projections. No recipe in the repo touches this, and it's the feature's
most general form: "decide against a read-set, append only if the read-set is still
the head, retry on `AppendConditionFailedError`."

**Document model.** `event-registration`: `setCapacity(n)`, `registerAttendee(name)`.
The invariant — registrations ≤ capacity — cannot be checked inside a reducer that sees
only one operation's state without racing a concurrent registration.

**Demo walkthrough:**
1. Define a small custom decision model over the registration stream (projection folds
   capacity + registration count; `decide` refuses a register that would exceed
   capacity).
2. Show the happy path: `buildDecisionModel(...)` → `{ model, appendCondition }` →
   guarded `apply` succeeds.
3. Force a conflict: two concurrent registrations for the last seat. One append lands;
   the other throws `AppendConditionFailedError` (nothing written), rebuilds against
   the new head, and is correctly refused on retry. Log the retry loop so the
   invalidate-rebuild-retry cycle is visible.
4. Note how the executor does the same dance for auth
   (`job-result-handler.ts` treats the failure as a concurrency conflict exempt from
   retry limits, up to 20 conflicts).

**Key references:** `packages/reactor/src/decision/build-decision-model.ts:24`, guarded
insert `packages/reactor/src/storage/kysely/store.ts:226`, retry contract
`packages/reactor/src/executor/job-result-handler.ts:98`. Test template:
`packages/reactor/test/decision/integration.test.ts:132`.

**Open question to resolve while building:** whether a userland decision model can be
driven end-to-end without touching non-exported internals (the executor's
`evaluateByPosition` is not exported). If the raw-store path is the only viable one,
the recipe should present it as "the mechanic, hand-driven" and say so.

---

## 6. `auth-admin-handoff` — administering the auth scope itself

**One-liner:** Who may change the policy is itself policy: the creator carve-out,
delegating auth administration via a grant on scope `"auth"`, and the lockout guardrails
that refuse any change that would leave the policy without an administrator.

**Why.** Every real deployment hits this within a week: "I initialized the policy,
now how do I hand off admin / what happens if I revoke my own access?" The platform has
first-class answers (creator carve-out, `AuthAdministrationLockoutError`,
`AuthAdministrationMissingError`) that deserve their own focused recipe rather than a
paragraph inside recipe 1.

**Document model.** Reuse `team-journal`, or a minimal `charter` model — the domain
operations barely matter here; the auth scope is the subject.

**Demo walkthrough (flags: both):**
1. Alice (signed creator) initializes a policy with no explicit auth-admin grant —
   works, because the creator may always execute on scope `"auth"`.
2. Alice grants Bob `{can:"execute", scope:"auth"}` — Bob can now `setGrant`.
3. Bob tries to remove the grant that makes him admin while no other admin path exists
   → `AuthAdministrationLockoutError`; the policy refuses to orphan itself.
4. Unsigned-creation variant: a document created without a signer has no creator
   carve-out, so `initializeAuth` *must* include a reachable auth-admin grant or it
   throws `AuthAdministrationMissingError`.
5. Sidebar: `UNDO`/`REDO`/`PRUNE` are banned on the auth scope — policy history is
   append-only.

**Key references:** guardrails `packages/shared/document-model/auth-v1.ts:372,395,475`,
creator carve-out in `evaluate` `packages/shared/document-model/auth.ts:505`, banned
actions `auth.ts:453`.

---

## Sequencing and scope notes

- **Suggested build order:** 1 → 2 → 3 → 4, then 5 and 6 independently. Recipes 1–2
  share a document model; 3–4 introduce the two-reactor sync harness (crib the
  builder/`settle`/`sync` helpers from
  `packages/reactor/test/decision/auth-projection.test.ts:55-117`).
- **Read gating is a candidate seventh recipe, not a footnote:** client-side scope
  filtering (`canReadScope`/`filterReadableScopes` in
  `packages/reactor/src/client/util.ts`) works *independently of the flags* — `auth`
  and `document` scopes are always readable, domain scopes need `{can:"read", scope}`.
  It's small enough that it may fold into recipe 1 as a section; decide when writing.
- **Explicit non-goals everywhere:** `{group}` / `{match}` principals and `where`
  conditions parse and store today but never match (grants carrying them are skipped),
  because `authGroups` / `authConditions` haven't shipped. Each recipe README should
  say this once so nobody demos a group grant and concludes enforcement is broken.
- **Denied ≠ erased:** several recipes surface stored denied operations. A shared
  README section (or a tiny shared helper) for "how to inspect denied operations"
  (`isDenied`, `deniedReason`, the closed consensus reason set) would keep the recipes
  consistent.
