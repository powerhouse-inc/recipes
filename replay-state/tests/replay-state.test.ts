import { beforeAll, describe, expect, it } from "vitest";
import type { Delivery } from "../src/recorder.js";
import { runScenario, type ScenarioResult } from "../src/scenario.js";

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

  it("collapse: one delivery per document stream (scope), with the latest state", () => {
    const deliveries = setNames(result.replay.collapse);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.stateName).toBe("Final");
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

  it("a live delivery carries the executor's state whatever the mode", () => {
    expect(result.live.actionType).toBe("SET_NAME");
    expect(result.live.stateName).toBe("Published");
  });
});
