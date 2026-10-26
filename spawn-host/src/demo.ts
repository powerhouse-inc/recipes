import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnHost, type SpawnedHost } from "@powerhousedao/host-core";
import type { SwitchboardOutputs } from "@powerhousedao/ph-cli/runners/switchboard";
import { withHost } from "./launch.js";

// This recipe is the project: hosts/switchboard/host.js, its own ph-cli.
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

let spawned: SpawnedHost | undefined;
await withHost(
  spawnHost,
  { projectRoot, host: "switchboard", readyTimeoutMs: 60_000 },
  async (host) => {
    spawned = host;
    console.log(`pid ${host.pid}, data in ${host.dataDir}`);
    console.log(JSON.stringify(host.outputs, null, 2));

    const { endpoints, drives } = host.outputs as SwitchboardOutputs;
    const graphql = await fetch(endpoints.graphql, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    console.log(`POST ${endpoints.graphql}: ${graphql.status} ${(await graphql.text()).trim()}`);
    const drive = await fetch(drives.recipes.url);
    console.log(`GET ${drives.recipes.url}: ${drive.status}`);
  },
);

const exit = await spawned!.exited;
console.log(`stopped: ${JSON.stringify(exit)}`);
console.log(`data dir removed: ${!existsSync(spawned!.dataDir)}`);
console.log(`project .ph created: ${existsSync(join(projectRoot, ".ph"))}`);
