import { checkHosts, formatReport } from "./check.js";

// The same hosts under two environments, as a deploy would see them.
const environments = {
  "REACTOR_WORKERS=2: switchboard fails a boot precondition on PGlite": {
    hosts: ["switchboard"],
    env: { REACTOR_WORKERS: "2" },
  },
  "nothing set: needs-env fails to resolve, bad-runner fails to load": {
    hosts: ["needs-env", "bad-runner"],
    env: {},
  },
  "REACTOR_DATA_DIR set: every host that can pass does": {
    hosts: ["switchboard", "needs-env", "connect"],
    env: { REACTOR_DATA_DIR: "./.ph/data" },
  },
};

let failed = false;
for (const [label, { hosts, env }] of Object.entries(environments)) {
  console.log(`# ${label}`);
  for (const report of await checkHosts(hosts, env)) {
    console.log(formatReport(report));
    failed ||= report.issues.length > 0;
  }
}
// The first two scenarios fail on purpose; the exit code is `ph host check`'s:
// 1 on any issue.
process.exitCode = failed ? 1 : 0;
