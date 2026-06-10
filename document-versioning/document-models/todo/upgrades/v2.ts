import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { TodoItemV1, TodoV1PHState } from "../v1/types.js";
import type { TodoItemV2, TodoV2PHState } from "../v2/types.js";

function migrateItems(items: TodoItemV1[]): TodoItemV2[] {
  return items.map(({ id, title, checked }) => ({
    id,
    title,
    status: checked ? "DONE" : "TODO",
    priority: 0,
  }));
}

/**
 * Pure v1→v2 migration. It runs once, when UPGRADE_DOCUMENT is dispatched —
 * never again during replay — so it must patch `state` AND `initialState` in
 * the same pass. Replay starts from the stored `initialState`; an item seeded
 * there (created by no operation) only reaches the v2 shape through this
 * function. Patch only `state` and replay diverges from the stored document.
 *
 * Upgrade reducers run on every peer: keep them deterministic (no Date.now(),
 * no randomness, no I/O) and return a new document — there is no immer draft
 * here, in-place mutation would be lost.
 */
function upgradeReducer(
  document: PHDocument<TodoV1PHState>,
  _action: Action,
): PHDocument<TodoV2PHState> {
  return {
    ...document,
    state: {
      ...document.state,
      global: {
        items: migrateItems(document.state.global.items),
      },
    },
    initialState: {
      ...document.initialState,
      global: {
        items: migrateItems(document.initialState.global.items),
      },
    },
  };
}

export const v2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer,
  description: "Replace checked: boolean with status, add priority",
};
