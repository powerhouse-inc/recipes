import type { Action } from "document-model";
import {
  addMember,
  bootstrap,
  grantAdmin,
  reducer,
  revokeAdmin,
  utils,
  writeNote,
  type RoleBasedAuthDocument,
} from "document-models/role-based-auth/v1";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCCcCccCccccCCCccccCccCcCcccccCCCCc2";

function as<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "demo", key: "demo" },
        signatures: [],
      },
    },
  };
}

function label(address: string): string {
  if (address === ALICE) return "Alice";
  if (address === BOB) return "Bob";
  if (address === CAROL) return "Carol";
  return address;
}

function step(
  doc: RoleBasedAuthDocument,
  caller: string,
  action: Action,
  description: string,
): RoleBasedAuthDocument {
  const next = reducer(doc, as(action, caller));
  const ops = next.operations.global;
  const latest = ops[ops.length - 1];
  const status = latest?.error ? `rejected (${latest.error})` : "ok";
  console.log(`[${label(caller)}] ${description} → ${status}`);
  return next;
}

let doc = utils.createDocument();

console.log("=== role-based-auth demo ===\n");

doc = step(doc, ALICE, bootstrap({}), "bootstrap");
doc = step(
  doc,
  BOB,
  writeNote({ id: "n1", text: "hi", createdAt: "2026-01-01T00:00:00Z" }),
  "writeNote (no role yet)",
);
doc = step(doc, ALICE, addMember({ address: BOB }), "addMember(Bob)");
doc = step(
  doc,
  BOB,
  writeNote({ id: "n2", text: "hello", createdAt: "2026-01-01T00:00:01Z" }),
  'writeNote("hello")',
);
doc = step(doc, BOB, grantAdmin({ address: CAROL }), "grantAdmin(Carol)");
doc = step(doc, ALICE, grantAdmin({ address: BOB }), "grantAdmin(Bob)");
doc = step(doc, BOB, grantAdmin({ address: CAROL }), "grantAdmin(Carol)");
doc = step(doc, CAROL, revokeAdmin({ address: ALICE }), "revokeAdmin(Alice)");

console.log("\n=== final state ===");
console.log(JSON.stringify(doc.state.global, null, 2));
