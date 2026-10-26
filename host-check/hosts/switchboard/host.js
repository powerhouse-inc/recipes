// A clean switchboard on PGlite. Nothing here fails a check by itself; what
// the check reports depends on the environment it is given.
export default {
  name: "switchboard",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "./.ph/reactor" },
      },
    },
    drives: [{ slug: "sektar" }],
  },
};
