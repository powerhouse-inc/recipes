import { runOrders } from "./flow.js";

const { result, journal } = await runOrders([
  { id: "o-1", status: "paid" },
  { id: "o-2", status: "refunded" },
  { id: "o-3", status: "disputed" },
]);
console.log(`run ${result.status}`);
for (const line of journal) console.log(`  ${line}`);
if (result.status !== "SUCCEEDED") process.exit(1);
