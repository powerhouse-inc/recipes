import { beforeAll, describe, expect, it } from "vitest";
import { runScenario, type ScenarioResult } from "../src/scenario.js";

describe("undo on base-reducer 3", () => {
  let r: ScenarioResult;
  beforeAll(async () => {
    r = await runScenario();
  }, 60_000);

  it("creates the document at base-reducer 3 by default", () => {
    expect(r.baseReducer).toBe(3);
  });

  it("stores each undo and redo as a RETRACT, not UNDO or REDO", () => {
    expect(r.operations.map((o) => o.action.type)).toEqual([
      "ADD_MODULE",
      "ADD_MODULE",
      "RETRACT",
      "RETRACT",
      "RETRACT",
    ]);
  });

  it("names the undone action by id; a redo retracts the undo", () => {
    const [, second, undo1, redo, undo2] = r.operations;
    expect(undo1.action.input).toEqual({ target: second.action.id });
    expect(redo.action.input).toEqual({ target: undo1.action.id });
    expect(undo2.action.input).toEqual({ target: second.action.id });
  });

  it("signs the RETRACTs as the author", () => {
    for (const o of r.operations) {
      expect(o.action.context?.signer?.app.key).toBe(r.signerKey);
    }
  });

  it("derives the document's modules and availability from the stream", () => {
    expect(r.steps.map((s) => [s.modules, s.canUndo, s.canRedo])).toEqual([
      [["a", "b"], true, false],
      [["a"], true, true],
      [["a", "b"], true, false],
      [["a"], true, true],
    ]);
  });

  it("reports the action ids an undo or redo would retract", () => {
    const [afterEdits, afterUndo] = r.steps;
    expect(afterEdits.undoTarget).toBe(r.editIds[1]);
    expect(afterEdits.redoTarget).toBeUndefined();
    expect(afterUndo.redoTarget).toBe(r.operations[2].action.id);
  });
});
