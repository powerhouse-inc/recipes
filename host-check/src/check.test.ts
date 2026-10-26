import { describe, expect, it, vi } from "vitest";
import { checkHosts, formatReport } from "./check.js";

const only = async (host: string, env: Record<string, string>) =>
  (await checkHosts([host], env))[0];

describe("host check", () => {
  it("reports a clean host as ok", async () => {
    const report = await only("switchboard", {});
    expect(report.issues).toEqual([]);
    expect(report.deferred).toEqual([]);
    expect(formatReport(report)).toBe("hosts/switchboard/host.js: ok");
  });

  it("reports a boot issue the server would refuse at startup", async () => {
    const report = await only("switchboard", { REACTOR_WORKERS: "2" });
    expect(report.issues.map((i) => i.stage)).toEqual(["boot"]);
    expect(report.issues[0].message).toContain("REACTOR_WORKERS");
    expect(report.issues[0].message).toContain("Postgres");
    // The precondition is the worker pool on PGlite: a Postgres URL clears it.
    // Nothing connects to it.
    const onPostgres = await only("switchboard", {
      REACTOR_WORKERS: "2",
      PH_REACTOR_DATABASE_URL: "postgres://localhost:1/reactor",
    });
    expect(onPostgres.issues).toEqual([]);
  });

  it("checks against the env it is given, not process.env", async () => {
    vi.stubEnv("REACTOR_WORKERS", "2");
    try {
      expect((await only("switchboard", {})).issues).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports an unset $env name at the resolve stage", async () => {
    const report = await only("needs-env", {});
    expect(report.issues.map((i) => i.stage)).toEqual(["resolve"]);
    expect(report.issues[0].path).toBe("reactor.backends.main.storage.dataDir");
    expect(report.issues[0].message).toContain("REACTOR_DATA_DIR");
    const fixed = await only("needs-env", { REACTOR_DATA_DIR: "./data" });
    expect(fixed.issues).toEqual([]);
  });

  it("reports an uninstalled runner module at the load stage", async () => {
    const report = await only("bad-runner", {});
    expect(report.issues.map((i) => i.stage)).toEqual(["load"]);
    expect(report.issues[0].message).toContain(
      "@powerhousedao/not-installed/runners/switchboard",
    );
    expect(report.issues[0].hint).toBeTruthy();
  });

  it("lists $output tokens as deferred when no outputs are given", async () => {
    const report = await only("connect", {});
    expect(report.issues).toEqual([]);
    expect(report.deferred).toEqual([
      {
        file: "hosts/connect/host.js",
        path: "reactor.drives[0].remote.url",
        members: ["switchboard"],
      },
    ]);
    expect(formatReport(report)).toBe(
      "hosts/connect/host.js: ok\n  1 output token(s) checked declared-only",
    );
  });
});
