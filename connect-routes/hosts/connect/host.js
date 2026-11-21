// The Connect host `ph connect studio` runs. The pages come from routes/
// beside this file; the generic plugin is Connect's own shell around them.
// No drives are declared: the browser's reactor starts empty.
export default {
  name: "connect-routes",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: [{ module: "@powerhousedao/connect/plugins/generic" }],
  },
  reactor: {
    backends: { main: { kind: "worker" } },
  },
};
