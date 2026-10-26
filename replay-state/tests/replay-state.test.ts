import { beforeAll, describe, expect, it } from "vitest";
import type { Delivery } from "../src/recorder.js";
import { MODES, runScenario, type ScenarioResult } from "../src/scenario.js";

const setNames = (deliveries: Delivery[]) =>
  deliveries.filter((d) => d.actionType === "SET_NAME");

describe("replayState", () => {
  let result: ScenarioResult;
  beforeAll(async () => {
    result = await runScenario();
  }, 60_000);

  it("latest: every operation carries the document's latest state", () => {
    const names = setNames(result.replay.latest).map((d) => d.stateName);
    expect(names).toEqual(["Final", "Final", "Final"]);
  });

  it("collapse: one delivery per stream (scope), its last operation, with the latest state", () => {
    expect(
      result.replay.collapse.map((d) => [d.scope, d.actionType, d.stateName]),
    ).toEqual([
      ["document", "UPGRADE_DOCUMENT", "Final"],
      ["global", "SET_NAME", "Final"],
    ]);
  });

  it("exact: every operation carries the state at its own revision", () => {
    const names = setNames(result.replay.exact).map((d) => d.stateName);
    expect(names).toEqual(["Draft", "Review", "Final"]);
  });

  it("operations: every operation arrives without state", () => {
    const deliveries = setNames(result.replay.operations);
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every((d) => d.stateName === null)).toBe(true);
  });

  it.each(MODES)(
    "%s: a live delivery carries the executor's state",
    (mode) => {
      expect(result.live[mode].actionType).toBe("SET_NAME");
      expect(result.live[mode].stateName).toBe("Published");
    },
  );
});
