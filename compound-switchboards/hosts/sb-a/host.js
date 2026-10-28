// Member a of the stack compound: a switchboard with its own reactor store,
// read model, protocol and config.switchboard. `${userData}` is the spawn's
// dataDir (PH_USER_DATA_DIR), so the stores land under <dataDir>/.ph/sb-a.
// Inspection is off here and on in sb-b.
export default {
  name: "sb-a",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 0 },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "${userData}/.ph/sb-a/reactor" },
        readModel: { url: "${userData}/.ph/sb-a/read-model" },
      },
    },
    protocol: {
      featureFlags: { documentDecisions: true },
      createSignaturePolicy: "legacy",
    },
    workflows: false,
    drives: [{ slug: "alpha", name: "alpha" }],
  },
  config: {
    switchboard: {
      packages: { disableLocal: true },
      auth: { admins: ["0xa"], wsRecheckMs: 1000 },
      inspection: { enabled: false },
    },
  },
};
