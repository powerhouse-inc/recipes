import { runScenario } from "./scenario.js";

const result = await runScenario();

console.log(`document type     ${result.documentType}`);
console.log(`global state      ${JSON.stringify(result.global)}`);
console.log(`local state       ${JSON.stringify(result.local)}`);
console.log(
  `stored local      schema ${JSON.stringify(result.storedLocal.schema)}, initialValue ${JSON.stringify(result.storedLocal.initialValue)}`,
);
console.log(
  `same definition as explicit { schema: null, initialValue: {} }: ${result.matchesExplicitLocal}`,
);
