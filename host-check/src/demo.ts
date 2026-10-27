import { checkHosts, formatReport } from "./check.js";

// The same hosts under three environments, as a deploy would see them. Each
// scenario names the stages it expects per host, so the planted failures are
// part of the demo and only a surprise fails the run.
const environments = {
  "REACTOR_WORKERS=2: switchboard fails a boot precondition on PGlite": {
    env: { REACTOR_WORKERS: "2" },
    expect: { switchboard: ["boot"] },
  },
  "nothing set: needs-env fails to resolve, bad-runner fails to load": {
    env: {},
    expect: { "needs-env": ["resolve"], "bad-runner": ["load"] },
  },
  "REACTOR_DATA_DIR set: every host that can pass does": {
    env: { REACTOR_DATA_DIR: "./.ph/data" },
    expect: { switchboard: [], "needs-env": [], connect: [] },
  },
};

let unexpected = 0;
for (const [label, { env, expect }] of Object.entries(environments)) {
  console.log(`# ${label}`);
  const expected: Record<string, string[]> = expect;
  for (const report of await checkHosts(Object.keys(expected), env)) {
    console.log(formatReport(report));
    const got = report.issues.map((i) => i.stage).join(",");
    const want = expected[report.host].join(",");
    if (got !== want) {
      console.log(`  unexpected: wanted [${want}], got [${got}]`);
      unexpected++;
    }
  }
}
// `ph host check` exits 1 on any issue. The demo plants issues on purpose,
// so it exits 1 only when a host reports something other than expected.
process.exitCode = unexpected > 0 ? 1 : 0;
