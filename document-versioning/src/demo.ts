/**
 * Walks the full lifecycle of a schema migration:
 *
 *   1. create a v1 document (with an item seeded straight into initialState)
 *   2. dispatch v1 operations
 *   3. upgrade to v2 via the manifest
 *   4. keep dispatching v2 operations
 *   5. replay the recorded history and verify it converges
 */
import {
  addItem as addItemV1,
  checkItem,
  reducer as reducerV1,
} from "document-models/todo/v1";
import {
  addItem as addItemV2,
  reducer as reducerV2,
  setPriority,
  setStatus,
  type TodoPHState as TodoV2PHState,
} from "document-models/todo/v2";
import { todoUpgradeManifest } from "document-models/todo/upgrades";
import { replay } from "./replay.js";
import { createV1Todo } from "./todo.js";
import { upgradeDocument } from "./upgrade.js";

// The "welcome" item exists only because it is seeded into the initial
// state — no operation ever creates or touches it. It reaches the v2 shape
// solely through the upgrade reducer's initialState patch.
let v1Doc = createV1Todo([
  { id: "welcome", title: "Take the tour", checked: true },
]);

v1Doc = reducerV1(v1Doc, addItemV1({ id: "milk", title: "Buy milk" }));
v1Doc = reducerV1(
  v1Doc,
  addItemV1({ id: "docs", title: "Read the versioning docs" }),
);
v1Doc = reducerV1(v1Doc, checkItem({ id: "milk", checked: true }));

console.log("v1 document — schema { id, title, checked }:");
console.log(JSON.stringify(v1Doc.state.global.items, null, 2));
console.log(`model version: ${v1Doc.state.document.version}`);

const upgraded = upgradeDocument<TodoV2PHState>(v1Doc, todoUpgradeManifest);

console.log("\nafter upgrade — schema { id, title, status, priority }:");
console.log(JSON.stringify(upgraded.state.global.items, null, 2));
console.log(`model version: ${upgraded.state.document.version}`);

let v2Doc = reducerV2(upgraded, setStatus({ id: "docs", status: "IN_PROGRESS" }));
v2Doc = reducerV2(v2Doc, setPriority({ id: "docs", priority: 5 }));
v2Doc = reducerV2(
  v2Doc,
  addItemV2({ id: "review", title: "Review the migration", priority: 1 }),
);

console.log("\nafter v2 operations:");
console.log(JSON.stringify(v2Doc.state.global.items, null, 2));

// Replay the way the platform loads a document: the migrated initialState
// plus every recorded global operation through the latest reducer. The v1
// CHECK_ITEM in the history is handled by the v2 reducer's legacy case.
const replayed = replay(v2Doc, reducerV2);
const converges =
  JSON.stringify(replayed.state.global) === JSON.stringify(v2Doc.state.global);

console.log(`\nreplay from initialState converges: ${converges}`);

console.log("\noperation history:");
for (const [scope, ops] of Object.entries(v2Doc.operations)) {
  for (const op of ops ?? []) {
    console.log(`  [${scope} #${op.index}] ${op.action.type}`);
  }
}
