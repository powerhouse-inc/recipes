import { loadSpawnHost, withHost } from "./launch.js";

const [projectRoot, host] = process.argv.slice(2);
if (!projectRoot || !host) {
  console.error("usage: pnpm start <projectRoot> <host folder under hosts/>");
  process.exit(1);
}
const spawnHost = await loadSpawnHost();
if (!spawnHost) {
  console.error("The installed host-core has no spawnHost; see the README.");
  process.exit(1);
}

await withHost(spawnHost, { projectRoot, host }, async (running) => {
  console.log(`pid ${running.pid}, data in ${running.dataDir}`);
  console.log(JSON.stringify(running.outputs, null, 2));
});
console.log("stopped; the project's .ph and .env were never touched");
