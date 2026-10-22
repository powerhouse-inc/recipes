import { connectHost } from "./hosts.js";
import {
  resolveHost,
  switchboardOutputs,
  type ResolvedDrives,
} from "./resolve.js";

// The same host file resolves against whatever port the switchboard bound.
for (const port of [4001, 4801]) {
  const resolved = resolveHost<ResolvedDrives>(
    connectHost,
    { switchboard: switchboardOutputs(port) },
    { GRAPHQL_PATH: "graphql" },
    "hosts/connect/host.js",
  );
  console.log(JSON.stringify(resolved.reactor.drives, null, 2));
}
