/**
 * Each scenario boots its own stand-in Vetra and, where it needs one, its own
 * host, and returns what it observed. `demo.ts` prints these results and
 * `licensed-access.test.ts` asserts them.
 */
import {
  assertAccessConfig,
  createVetraAccessGate,
} from "@powerhousedao/reactor-api";
import {
  ADMIN,
  GATE_TOKEN,
  get,
  graphql,
  HOLDER,
  NEWCOMER,
  openSocket,
  STRANGER,
  type CloseInfo,
} from "./callers.js";
import { startHost, type HostEnv } from "./host.js";
import { startFakeVetra, type FakeVetra } from "./vetra.js";

/** The env a switchboard gets for a shared instance of an app. */
export function licensedEnv(vetra: FakeVetra, extra: HostEnv = {}): HostEnv {
  return {
    ACCESS: "licensed",
    ADMINS: ADMIN,
    VETRA_GATE_URL: vetra.url,
    VETRA_GATE_TOKEN: GATE_TOKEN,
    VETRA_APP_ID: "app-recipes-demo",
    ...extra,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Longer than the 1 s answer TTL the stand-in Vetra hands out. */
const PAST_TTL_MS = 1_200;

async function withVetra<T>(run: (vetra: FakeVetra) => Promise<T>) {
  const vetra = await startFakeVetra({ token: GATE_TOKEN, ttlSeconds: 1 });
  try {
    return await run(vetra);
  } finally {
    await vetra.close();
  }
}

async function withHost<T>(
  env: HostEnv,
  run: (host: Awaited<ReturnType<typeof startHost>>) => Promise<T>,
) {
  const host = await startHost(env);
  try {
    return await run(host);
  } finally {
    await host.close();
  }
}

/** 1. Who gets in over HTTP, and who the host asks Vetra about. */
export function admission() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    return withHost(licensedEnv(vetra), async (host) => {
      const anonymous = await graphql(host.origin);
      const stranger = await graphql(host.origin, STRANGER);
      const holder = await graphql(host.origin, HOLDER);
      const admin = await graphql(host.origin, ADMIN);
      const driveDiscovery = await get(host.origin, "/d/powerhouse");
      return {
        anonymous: anonymous.status,
        stranger: stranger.status,
        strangerBody: stranger.body,
        holder: holder.status,
        admin: admin.status,
        anonymousDriveDiscovery: driveDiscovery,
        health: await get(host.origin, "/health"),
        ready: await get(host.origin, "/ready"),
        askedVetraAbout: vetra.calls.map((call) => call.address),
        sentToVetra: {
          authorization: vetra.calls[0]?.authorization,
          appId: vetra.calls[0]?.appId,
        },
        policy: host.policy,
      };
    });
  });
}

/** 2. Answers are cached for Vetra's `ttlSeconds`; a revoked licence lapses after it. */
export function cacheAndLapse() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    return withHost(licensedEnv(vetra), async (host) => {
      const first = (await graphql(host.origin, HOLDER)).status;
      const second = (await graphql(host.origin, HOLDER)).status;
      const callsWithinTtl = vetra.calls.length;

      vetra.revoke(HOLDER);
      const rightAfterRevoke = (await graphql(host.origin, HOLDER)).status;
      await sleep(PAST_TTL_MS);
      const afterTtl = (await graphql(host.origin, HOLDER)).status;
      return { first, second, callsWithinTtl, rightAfterRevoke, afterTtl };
    });
  });
}

/** 3. WebSockets: refused at connect, and closed at the recheck after a lapse. */
export function sockets() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    const env = licensedEnv(vetra, { WS_CREDENTIAL_RECHECK_INTERVAL_MS: "300" });
    return withHost(env, async (host) => {
      const stranger = await openSocket(host.port, STRANGER);
      const holder = await openSocket(host.port, HOLDER);
      if (holder.kind !== "connected") {
        throw new Error(`The holder's socket was refused: ${holder.reason}`);
      }
      const startedAt = Date.now();
      vetra.revoke(HOLDER);
      const closed = await Promise.race([
        holder.closed,
        sleep(10_000).then((): CloseInfo => ({ code: 0, reason: "still open" })),
      ]);
      await holder.close();
      return {
        stranger:
          stranger.kind === "refused"
            ? { code: stranger.code, reason: stranger.reason }
            : { code: 0, reason: "connected" },
        holderConnected: true,
        holderClosedAfterRevoke: closed,
        closedWithinMs: Date.now() - startedAt,
      };
    });
  });
}

/** 4. Vetra goes down: callers it allowed recently stay in, unseen ones do not. */
export function outage() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    return withHost(licensedEnv(vetra), async (host) => {
      const before = (await graphql(host.origin, HOLDER)).status;

      vetra.setDown(true);
      vetra.grant(NEWCOMER); // a licence Vetra would confirm, if it answered
      await sleep(PAST_TTL_MS);
      const holderDuringOutage = (await graphql(host.origin, HOLDER)).status;
      const newcomerDuringOutage = (await graphql(host.origin, NEWCOMER))
        .status;
      const adminDuringOutage = (await graphql(host.origin, ADMIN)).status;

      vetra.setDown(false);
      // The host waits 5 s before asking a failing Vetra about an address again.
      await sleep(5_200);
      const newcomerAfter = (await graphql(host.origin, NEWCOMER)).status;
      return {
        before,
        holderDuringOutage,
        newcomerDuringOutage,
        adminDuringOutage,
        newcomerAfter,
      };
    });
  });
}

/** 5. Vetra refuses the instance's token: only ADMINS get in. */
export function wrongToken() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    const env = licensedEnv(vetra, { VETRA_GATE_TOKEN: "vgt_" + "00".repeat(32) });
    return withHost(env, async (host) => ({
      holder: (await graphql(host.origin, HOLDER)).status,
      admin: (await graphql(host.origin, ADMIN)).status,
    }));
  });
}

/**
 * 6. The gate client on its own, with a fake clock, to show grace over hours:
 * `createVetraAccessGate` is what the host builds from `VETRA_GATE_*` and
 * `ACCESS_GATE_GRACE_MS`.
 */
export function graceTimeline() {
  return withVetra(async (vetra) => {
    vetra.grant(HOLDER);
    let now = Date.parse("2026-11-13T12:00:00Z");
    const minutes = (n: number) => (now += n * 60_000);
    const gate = createVetraAccessGate({
      url: vetra.url,
      token: GATE_TOKEN,
      graceMs: 60 * 60_000, // ACCESS_GATE_GRACE_MS=3600000
      now: () => now,
      logger: silent,
    });
    const steps: Array<{ at: string; who: string; verdict: string }> = [];
    const check = async (at: string, who: string, address: string) => {
      const verdict = await gate.check(address);
      steps.push({
        at,
        who,
        verdict: `${verdict.allowed ? "allowed" : "refused"} (${verdict.source})`,
      });
    };

    await check("12:00", "holder", HOLDER);
    await check("12:00", "stranger", STRANGER);
    await check("12:00", "holder again", HOLDER);
    vetra.setDown(true);
    minutes(2);
    await check("12:02 Vetra down", "holder", HOLDER);
    await check("12:02 Vetra down", "stranger", STRANGER);
    minutes(59);
    await check("13:01 Vetra down", "holder", HOLDER);
    vetra.setDown(false);
    minutes(1);
    await check("13:02 Vetra back", "holder", HOLDER);
    vetra.rotateToken("vgt_" + "ff".repeat(32));
    minutes(2);
    await check("13:04 token revoked", "holder", HOLDER);
    vetra.setDown(true);
    minutes(1);
    await check("13:05 Vetra down", "holder", HOLDER);
    return steps;
  });
}

/** 7. Settings `ACCESS=licensed` refuses at boot, and the policy it runs. */
export async function bootRules() {
  const gate = {
    VETRA_GATE_URL: "https://vetra.example/apps/gate/check",
    VETRA_GATE_TOKEN: GATE_TOKEN,
  };
  const cases: Array<[string, HostEnv]> = [
    ["no VETRA_GATE_TOKEN", { ACCESS: "licensed", VETRA_GATE_URL: gate.VETRA_GATE_URL }],
    [
      "an http gate off localhost",
      { ACCESS: "licensed", ...gate, VETRA_GATE_URL: "http://vetra.example/g" },
    ],
    [
      "SKIP_CREDENTIAL_VERIFICATION=true",
      { ACCESS: "licensed", ...gate, SKIP_CREDENTIAL_VERIFICATION: "true" },
    ],
    ["ACCESS=members", { ACCESS: "members" }],
  ];
  const refusals: Array<{ env: string; error: string }> = [];
  for (const [name, env] of cases) {
    try {
      await startHost(env).then((host) => host.close());
      refusals.push({ env: name, error: "booted" });
    } catch (error) {
      refusals.push({
        env: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const policies = await withVetra(async (vetra) => ({
    licensed: await withHost(licensedEnv(vetra), async (h) => h.policy),
    licensedWithDocumentPermissions: await withHost(
      licensedEnv(vetra, { DOCUMENT_PERMISSIONS_ENABLED: "true" }),
      async (h) => h.policy,
    ),
    authEnabledWithoutAccess: await withHost(
      { AUTH_ENABLED: "true", ADMINS: ADMIN },
      async (h) => h.policy,
    ),
  }));

  // The same check without booting: what a deploy script can run first.
  const preflight = assertAccessConfig(
    { mode: "licensed", gateUrl: gate.VETRA_GATE_URL, gateToken: GATE_TOKEN },
    false,
  );
  return { refusals, policies, preflight };
}

const silent = {
  level: "error",
  verbose: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  errorHandler: () => () => {},
  child: () => silent,
} as unknown as Parameters<typeof createVetraAccessGate>[0]["logger"];
