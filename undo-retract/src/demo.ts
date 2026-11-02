import { runScenario } from "./scenario.js";

const r = await runScenario();

console.log("Undo by RETRACT");
console.log("═══════════════\n");
console.log(`Document created at base-reducer ${r.baseReducer}\n`);
for (const s of r.steps) {
  console.log(
    `${s.label.padEnd(26)} modules: [${s.modules.join(", ")}]  canUndo: ${s.canUndo}  canRedo: ${s.canRedo}`,
  );
}
console.log("\nGlobal stream:");
for (const [i, o] of r.operations.entries()) {
  const target = (o.action.input as { target?: string }).target;
  console.log(
    `  ${i}  ${o.action.type.padEnd(9)} ${target ? `target: ${target === r.editIds[1] ? "edit #2" : "a RETRACT"}` : ""}`,
  );
}
process.exit(0);
