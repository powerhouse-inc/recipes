import { describe, expect, it } from "vitest";
import { connectHost } from "./hosts.js";
import {
  resolveHost,
  switchboardOutputs,
  TokenResolutionError,
  type ResolvedDrives,
} from "./resolve.js";

const env = { GRAPHQL_PATH: "graphql" };
const switchboard = switchboardOutputs(4801);

describe("output tokens", () => {
  it("resolves $output, $concat and $env from the producer's outputs", () => {
    const resolved = resolveHost<ResolvedDrives>(
      connectHost,
      { switchboard },
      env,
    );
    expect(resolved.reactor.drives.map((d) => d.remote.url)).toEqual([
      "http://localhost:4801/d/sektar",
      "http://localhost:4801/graphql",
    ]);
  });

  it("follows the port the producer bound, not one the host declares", () => {
    const resolved = resolveHost<ResolvedDrives>(
      connectHost,
      { switchboard: switchboardOutputs(4002) },
      env,
    );
    expect(resolved.reactor.drives[0].remote.url).toBe(
      "http://localhost:4002/d/sektar",
    );
  });

  it("renders $map once per element, with $key and $item", () => {
    const host = {
      drives: {
        $map: {
          over: { $output: { host: "switchboard", path: ["drives"] } },
          to: { slug: { $key: true }, url: { $item: ["url"] } },
        },
      },
    };
    expect(resolveHost(host, { switchboard })).toEqual({
      drives: [{ slug: "sektar", url: "http://localhost:4801/d/sektar" }],
    });
  });

  it("does not mutate the declared host", () => {
    resolveHost(connectHost, { switchboard }, env);
    expect(connectHost.reactor.drives[0].remote.url).toHaveProperty("$output");
  });

  it("fails naming the host whose outputs are unavailable", () => {
    expect(() => resolveHost(connectHost, {}, env)).toThrow(/switchboard/);
  });

  it("fails naming a required $env that is unset", () => {
    expect(() =>
      resolveHost(connectHost, { switchboard }, {}, "hosts/connect/host.js"),
    ).toThrow(/hosts\/connect\/host\.js.*GRAPHQL_PATH|GRAPHQL_PATH/);
    expect(() => resolveHost(connectHost, { switchboard })).toThrow(
      TokenResolutionError,
    );
  });
});
