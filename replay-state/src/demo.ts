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
      `  ordinal ${d.ordinal}  ${d.actionType}  state name: ${d.stateName === null ? "(no state)" : `"${d.stateName}"`}`,
    );
  }
}
console.log(
  `\nLive delivery after catch-up: ${live.actionType}, state name "${live.stateName}"`,
);
process.exit(0);
