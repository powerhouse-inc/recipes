// A switchboard on PGlite. `${userData}` is the spawn's dataDir
// (PH_USER_DATA_DIR), so the reactor's storage lands there, not in this folder.
export default {
  name: "switchboard",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "${userData}/.ph/reactor" },
      },
    },
    drives: [{ slug: "recipes" }],
  },
};
