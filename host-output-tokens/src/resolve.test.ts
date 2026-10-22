import { describe, expect, it } from "vitest";
import { connectHost } from "./hosts.js";
import {
  resolveHost,
  TokenResolutionError,
  type SwitchboardOutputs,
} from "./resolve.js";

const switchboard: SwitchboardOutputs = {
  origin: "http://localhost:4801",
  drives: { sektar: { id: "sektar", url: "http://localhost:4801/d/sektar" } },
};

describe("output tokens", () => {
  it("resolves $output, $concat and $env from the producer's outputs", () => {
    const resolved = resolveHost(
      connectHost,
      { switchboard },
      { GRAPHQL_PATH: "graphql" },
    );
    expect(resolved.reactor.drives.map((d) => d.remote.url)).toEqual([
      "http://localhost:4801/d/sektar",
      "http://localhost:4801/graphql",
    ]);
  });

  it("follows the port the producer bound, not one the host declares", () => {
    const moved = {
      origin: "http://localhost:4002",
      drives: { sektar: { id: "sektar", url: "http://localhost:4002/d/sektar" } },
    };
    const resolved = resolveHost(connectHost, { switchboard: moved }, {
      GRAPHQL_PATH: "graphql",
    });
    expect(resolved.reactor.drives[0].remote.url).toBe(
      "http://localhost:4002/d/sektar",
    );
  });

  it("does not mutate the declared host", () => {
    resolveHost(connectHost, { switchboard }, { GRAPHQL_PATH: "graphql" });
    expect(connectHost.reactor.drives[0].remote.url).toHaveProperty("$output");
  });

  it("fails naming the host whose outputs are unavailable", () => {
    expect(() =>
      resolveHost(connectHost, {}, { GRAPHQL_PATH: "graphql" }),
    ).toThrow(/switchboard/);
  });

  it("fails on a required $env that is unset", () => {
    expect(() => resolveHost(connectHost, { switchboard })).toThrow(
      TokenResolutionError,
    );
  });
});
