import { checkHosts, formatReport } from "./check.js";

const hosts = ["switchboard", "needs-env", "bad-runner"];

// The same hosts under two environments, as a deploy would see them.
const environments = {
  "REACTOR_WORKERS=2 (a boot precondition PGlite fails)": {
    REACTOR_WORKERS: "2",
  },
  "REACTOR_DATA_DIR set": { REACTOR_DATA_DIR: "./.ph/data" },
};

let failed = false;
for (const [label, env] of Object.entries(environments)) {
  console.log(`# ${label}`);
  for (const report of await checkHosts(hosts, env)) {
    console.log(formatReport(report));
    failed ||= report.issues.length > 0;
  }
}
// What `ph host check` does: exit 1 on any issue.
process.exitCode = failed ? 1 : 0;
