// `$output` reads a value another host produces when it runs. With no outputs
// to read, the check validates the token as declared and lists it as deferred.
export default {
  name: "connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: [
      {
        slug: "sektar",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "sektar", "url"] },
          },
        },
      },
    ],
  },
};
