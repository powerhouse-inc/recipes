import "./quiet.js";
import { describe, expect, it } from "vitest";
import { ADMIN, GATE_TOKEN, HOLDER, STRANGER } from "./callers.js";
import {
  admission,
  bootRules,
  cacheAndLapse,
  graceTimeline,
  outage,
  sockets,
  wrongToken,
} from "./scenarios.js";

describe("a host run with ACCESS=licensed", () => {
  it("admits admins and licence holders, and nobody else", async () => {
    const result = await admission();
    expect(result).toMatchObject({
      anonymous: 401,
      stranger: 403,
      holder: 200,
      admin: 200,
      anonymousDriveDiscovery: 401,
      health: 200,
      policy: "OPEN",
    });
    expect(result.ready).not.toBe(401);
    expect(result.ready).not.toBe(403);
    expect(JSON.parse(result.strangerBody)).toEqual({
      error: "No licence for this app",
    });
    // Admins never reach Vetra.
    expect(result.askedVetraAbout.sort()).toEqual([HOLDER, STRANGER].sort());
    expect(result.sentToVetra).toEqual({
      authorization: `Bearer ${GATE_TOKEN}`,
      appId: "app-recipes-demo",
    });
    expect(result.askedVetraAbout).not.toContain(ADMIN);
  }, 60_000);

  it("caches Vetra's answer for its TTL, then sees the lapse", async () => {
    expect(await cacheAndLapse()).toEqual({
      first: 200,
      second: 200,
      callsWithinTtl: 1,
      rightAfterRevoke: 200,
      afterTtl: 403,
    });
  }, 60_000);

  it("refuses a stranger's socket and closes a holder's once the licence lapses", async () => {
    const result = await sockets();
    expect(result.stranger).toEqual({ code: 4403, reason: "bearer-rejected" });
    expect(result.holderClosedAfterRevoke).toEqual({
      code: 4403,
      reason: "credential-revoked",
    });
  }, 60_000);

  it("keeps recent holders in while Vetra is down, and no one it has not seen", async () => {
    expect(await outage()).toEqual({
      before: 200,
      holderDuringOutage: 200,
      newcomerDuringOutage: 403,
      adminDuringOutage: 200,
      newcomerAfter: 200,
    });
  }, 60_000);

  it("admits only admins when Vetra refuses the token", async () => {
    expect(await wrongToken()).toEqual({ holder: 403, admin: 200 });
  }, 60_000);
});

describe("the gate client", () => {
  it("answers from grace for ACCESS_GATE_GRACE_MS, never for a denial or a 401", async () => {
    expect(await graceTimeline()).toEqual([
      { at: "12:00", who: "holder", verdict: "allowed (gate)" },
      { at: "12:00", who: "stranger", verdict: "refused (gate)" },
      { at: "12:00", who: "holder again", verdict: "allowed (cache)" },
      { at: "12:02 Vetra down", who: "holder", verdict: "allowed (grace)" },
      { at: "12:02 Vetra down", who: "stranger", verdict: "refused (refused)" },
      { at: "13:01 Vetra down", who: "holder", verdict: "refused (refused)" },
      { at: "13:02 Vetra back", who: "holder", verdict: "allowed (gate)" },
      { at: "13:04 token revoked", who: "holder", verdict: "refused (refused)" },
      { at: "13:05 Vetra down", who: "holder", verdict: "refused (refused)" },
    ]);
  });
});

describe("boot", () => {
  it("refuses a licensed host it cannot run safely, and never runs ADMIN_ONLY", async () => {
    const { refusals, policies, preflight } = await bootRules();
    expect(refusals).toEqual([
      {
        env: "no VETRA_GATE_TOKEN",
        error: expect.stringContaining(
          "ACCESS=licensed needs VETRA_GATE_URL and VETRA_GATE_TOKEN",
        ),
      },
      {
        env: "an http gate off localhost",
        error: expect.stringContaining(
          "ACCESS=licensed needs VETRA_GATE_URL and VETRA_GATE_TOKEN",
        ),
      },
      {
        env: "SKIP_CREDENTIAL_VERIFICATION=true",
        error: expect.stringContaining("SKIP_CREDENTIAL_VERIFICATION"),
      },
      {
        env: "ACCESS=members",
        error:
          "ACCESS=members is not supported; use ACCESS=licensed with Vetra's gate",
      },
    ]);
    expect(policies).toEqual({
      licensed: "OPEN",
      licensedWithDocumentPermissions: "DOCUMENT_PERMISSIONS",
      authEnabledWithoutAccess: "ADMIN_ONLY",
    });
    expect(preflight).toBe(true);
  }, 120_000);
});
