import { checkHost } from "@powerhousedao/host-core";
import {
  driveAnswers,
  inspectionAnswers,
  projectRoot,
  withStack,
  type StackMembers,
} from "./stack.js";

async function printMembers(members: StackMembers): Promise<void> {
  for (const [key, outputs] of Object.entries(members)) {
    const drives = Object.keys(outputs.drives);
    console.log(`  ${key}: ${outputs.origin}, drives ${drives.join(", ")}`);
    for (const slug of ["alpha", "beta"]) {
      console.log(`    /d/${slug}: ${(await driveAnswers(outputs.origin, slug)) ? "served" : "not found"}`);
    }
    console.log(`    /graphql/inspection: ${(await inspectionAnswers(outputs.origin)) ? "answers" : "not mounted"}`);
  }
}

// 1. Both member files, checked without starting anything.
for (const env of [{}, { CREATE_SIGNATURE_POLICY: "v2-required" }]) {
  const { issues } = await checkHost("stack", { projectRoot, env });
  console.log(`checkHost stack, env ${JSON.stringify(env)}:`);
  if (issues.length === 0) console.log("  ok");
  for (const i of issues) console.log(`  ${i.stage} ${i.file} ${i.path}: ${i.message}`);
}

// 2. The compound with each member's own config.
console.log("\nph run stack:");
await withStack({}, async (host, members) => {
  console.log(`  pid ${host.pid}, data in ${host.dataDir}`);
  await printMembers(members);
});

// 3. The operator's env over both members.
console.log("\nph run stack with INSPECTION_ENABLED=false:");
await withStack({ INSPECTION_ENABLED: "false" }, async (_host, members) => {
  await printMembers(members);
});
