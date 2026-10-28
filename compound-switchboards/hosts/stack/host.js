// Both switchboards in one `ph run stack` process. Each member reads its own
// host file; the compound adds nothing to their config. Leave
// config.runtimeRecord unset: spawnHost waits for the run record.
export default {
  name: "stack",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { a: { host: "sb-a" }, b: { host: "sb-b" } },
};
