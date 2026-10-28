// Member b of the stack compound. Same shape as sb-a, different values: its
// own stores under <dataDir>/.ph/sb-b, another protocol, other auth settings,
// inspection on with its own throttle, and its own keypair. sb-a keeps the
// default keypair, <userData>/.ph/.keypair.json.
export default {
  name: "sb-b",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 0 },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "${userData}/.ph/sb-b/reactor" },
        readModel: { url: "${userData}/.ph/sb-b/read-model" },
      },
    },
    protocol: {
      featureFlags: { documentDecisions: false },
      unsupportedStoredDocuments: "read-only",
    },
    workflows: false,
    drives: [{ slug: "beta", name: "beta" }],
  },
  config: {
    switchboard: {
      packages: { disableLocal: true },
      identity: { keypairPath: "${userData}/.ph/sb-b/.keypair.json" },
      auth: { documentPermissions: { cacheTtlMs: 500 } },
      inspection: { enabled: true, callsPerMinute: 7 },
    },
  },
};
