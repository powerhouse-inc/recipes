// A switchboard on PGlite. `${userData}` is the spawn's dataDir
// (PH_USER_DATA_DIR), so the reactor's storage lands there, not in this folder.
// Port 0 asks the OS for a free port; the run record's outputs report it, so
// several copies can run at once without probing for one.
export default {
  name: "switchboard",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 0 },
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
