import { describe, expect, it } from "vitest";
import { runOrders } from "./flow.js";

describe("router inside a loop", () => {
  it("sends each order down its own branch, journaled per iteration", async () => {
    const { result, journal, calls } = await runOrders([
      { id: "o-1", status: "paid" },
      { id: "o-2", status: "refunded" },
      { id: "o-3", status: "disputed" },
    ]);
    expect(result.status).toBe("SUCCEEDED");
    expect(calls.map((c) => [c.step.id, (c.config as { order?: string }).order])).toEqual([
      ["ship", "o-1"],
      ["refund", "o-2"],
      ["review", "o-3"],
      ["summary", undefined],
    ]);
    expect(journal.filter((l) => l.startsWith("each_order["))).toContain(
      "each_order[1]/route SUCCEEDED",
    );
    expect(journal.at(-1)).toBe("summary SUCCEEDED");
  });

  it("skips the body of an empty batch and still continues after the loop", async () => {
    const { result, calls } = await runOrders([]);
    expect(result.status).toBe("SUCCEEDED");
    expect(calls.map((c) => c.step.id)).toEqual(["summary"]);
  });
});
