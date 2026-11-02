import { runOrders } from "./flow.js";

const orders = [
  { id: "o-1", status: "paid" },
  { id: "o-2", status: "refunded" },
  { id: "o-3", status: "disputed" },
];
const expected = ["ship", "refund", "review"];
const { result, journal, calls } = await runOrders(orders);
console.log(`run ${result.status}`);
for (const line of journal) console.log(`  ${line}`);
const taken = calls.slice(0, orders.length).map((c) => c.step.id);
orders.forEach((o, i) => console.log(`${o.id} (${o.status}) -> ${taken[i]}`));
if (result.status !== "SUCCEEDED" || taken.join() !== expected.join()) {
  process.exit(1);
}
