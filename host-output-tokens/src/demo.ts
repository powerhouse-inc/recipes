import { connectHost } from "./hosts.js";
import { resolveHost, type SwitchboardOutputs } from "./resolve.js";

// The same host file resolves against whatever port the switchboard bound.
for (const port of [4001, 4801]) {
  const switchboard: SwitchboardOutputs = {
    origin: `http://localhost:${port}`,
    drives: {
      sektar: { id: "sektar", url: `http://localhost:${port}/d/sektar` },
    },
  };
  const resolved = resolveHost(
    connectHost,
    { switchboard },
    { GRAPHQL_PATH: "graphql" },
  );
  console.log(JSON.stringify(resolved.reactor.drives, null, 2));
}
