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
    for (const i of [1, 2, 3]) {
      expect(journal.filter((l) => l === `each_order[${i}]/route SUCCEEDED`)).toHaveLength(1);
    }
    // Only the branch taken runs: "paid" does not fall through to review.
    expect(calls.filter((c) => c.step.id === "review")).toHaveLength(1);
    expect(calls.at(-1)?.config).toEqual({ orders: 3 });
    expect(journal.at(-1)).toBe("summary SUCCEEDED");
  });

  it("skips the body of an empty batch and still continues after the loop", async () => {
    const { result, calls } = await runOrders([]);
    expect(result.status).toBe("SUCCEEDED");
    expect(calls.map((c) => c.step.id)).toEqual(["summary"]);
  });
});
