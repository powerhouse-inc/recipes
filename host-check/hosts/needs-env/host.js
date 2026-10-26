// `$env` reads the environment the host runs in. The check reports a name
// that is unset instead of waiting for `ph run` to throw on it.
export default {
  name: "needs-env",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: { $env: "REACTOR_DATA_DIR" } },
      },
    },
  },
};
