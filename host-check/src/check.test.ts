import { describe, expect, it } from "vitest";
import { checkHosts, formatReport } from "./check.js";

const only = async (host: string, env: Record<string, string>) =>
  (await checkHosts([host], env))[0];

describe("host check", () => {
  it("reports a clean host as ok", async () => {
    const report = await only("switchboard", {});
    expect(report.issues).toEqual([]);
    expect(formatReport(report)).toBe("hosts/switchboard/host.js: ok");
  });

  it("reports a boot issue the server would refuse at startup", async () => {
    const report = await only("switchboard", { REACTOR_WORKERS: "2" });
    expect(report.issues.map((i) => i.stage)).toEqual(["boot"]);
  });

  it("checks against the env it is given, not process.env", async () => {
    process.env.REACTOR_WORKERS = "2";
    try {
      expect((await only("switchboard", {})).issues).toEqual([]);
    } finally {
      delete process.env.REACTOR_WORKERS;
    }
  });

  it("reports an unset $env name at the resolve stage", async () => {
    const report = await only("needs-env", {});
    expect(report.issues.map((i) => i.stage)).toEqual(["resolve"]);
    expect(report.issues[0].message).toContain("REACTOR_DATA_DIR");
    const fixed = await only("needs-env", { REACTOR_DATA_DIR: "./data" });
    expect(fixed.issues).toEqual([]);
  });

  it("reports an uninstalled runner module at the load stage", async () => {
    const report = await only("bad-runner", {});
    expect(report.issues.map((i) => i.stage)).toEqual(["load"]);
  });
});
