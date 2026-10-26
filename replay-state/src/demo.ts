import { MODES, runScenario } from "./scenario.js";

const { replay, live } = await runScenario();

console.log("Replay State Demo");
console.log("═════════════════\n");
console.log(
  "One document renamed Draft -> Review -> Final, then replayed from the start.\n",
);
for (const mode of MODES) {
  console.log(`replayState: "${mode}"  (${replay[mode].length} deliveries)`);
  for (const d of replay[mode]) {
    console.log(
      `  ordinal ${d.ordinal}  ${d.scope.padEnd(8)}  ${d.actionType.padEnd(16)}  state name: ${d.stateName === null ? "(no state)" : `"${d.stateName}"`}`,
    );
  }
}
console.log("\nLive delivery after catch-up (renamed to Published):");
for (const mode of MODES) {
  const d = live[mode];
  console.log(
    `  ${`"${mode}"`.padEnd(12)}  ${d.actionType}  state name: ${d.stateName === null ? "(no state)" : `"${d.stateName}"`}`,
  );
}
process.exit(0);
