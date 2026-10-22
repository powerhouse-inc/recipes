/**
 * Two hosts as `hosts/<name>/host.js` would export them: plain JSON, no
 * imports, no `process.env`. The Connect host never writes the switchboard's
 * port. It names the value it needs and the resolver fills it in from what the
 * switchboard actually bound.
 */

export const switchboardHost = {
  name: "switchboard",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
  reactor: { drives: [{ slug: "sektar" }] },
};

export const connectHost = {
  name: "connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect" },
  reactor: {
    drives: [
      {
        slug: "sektar",
        // `$output` reads the value at `path` in another host's outputs.
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "sektar", "url"] },
          },
        },
      },
      {
        slug: "sektar-graphql",
        // `$concat` joins strings and numbers; `$env` reads the environment.
        remote: {
          url: {
            $concat: [
              { $output: { host: "switchboard", path: ["origin"] } },
              "/",
              { $env: "GRAPHQL_PATH" },
            ],
          },
        },
      },
    ],
  },
};
