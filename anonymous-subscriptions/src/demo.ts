import {
  ADMIN_ADDRESS,
  log,
  open,
  preFix,
  requireAuth,
  sleep,
} from "./config.js";
import {
  createFixture,
  graphql,
  mintBearer,
  reachable,
  rename,
} from "./reactor.js";
import { watch } from "./socket.js";

const SETTLE_MS = 2_000;

async function scenarioZero(): Promise<void> {
  log(
    "0. The same anonymous subscription against a Switchboard without the fix",
  );

  if (!preFix.ws) {
    log("   SKIPPED: pass --pre-fix-ws to point at one; see README.");
    return;
  }

  const old = watch({
    label: "pre-fix  ",
    url: preFix.ws,
    connectionParams: () => ({}),
    retryAttempts: 5,
  });
  await sleep(SETTLE_MS);

  log(`   connects=${old.connects} closes=${JSON.stringify(old.closes)}`);
  log(`   abandoned: ${JSON.stringify(old.abandoned)}`);
  old.stop();
  await sleep(200);
}

async function scenarioOne(): Promise<void> {
  log("1. An anonymous subscription against an auth-enabled Switchboard");

  const anonymous = watch({
    label: "anonymous",
    url: open.ws,
    connectionParams: () => ({}),
  });
  await sleep(SETTLE_MS);

  log(
    `   connects=${anonymous.connects} closes=${JSON.stringify(anonymous.closes)} abandoned=${anonymous.abandoned ?? "no"}`,
  );
  anonymous.stop();
  await sleep(200);
}

async function scenarioTwo(token: string): Promise<void> {
  log("2. What the anonymous caller receives, per document");

  const fixture = await createFixture(open.http, token);
  log(`   readable: ${fixture.readable}`);
  log(`   withheld: ${fixture.withheld} (setDocumentProtection)`);

  const anonymous = watch({
    label: "anonymous",
    url: open.ws,
    connectionParams: () => ({}),
  });
  const admin = watch({
    label: "admin    ",
    url: open.ws,
    connectionParams: () => ({ authorization: `Bearer ${token}` }),
  });
  await sleep(500);

  await rename(open.http, token, fixture.readable, "readable-one");
  await rename(open.http, token, fixture.withheld, "withheld-one");
  await sleep(SETTLE_MS);

  log(`   anonymous received: ${JSON.stringify(anonymous.received)}`);
  log(`   admin received:     ${JSON.stringify(admin.received)}`);
  log(
    `   anonymous errors=${JSON.stringify(anonymous.errors)} closes=${JSON.stringify(anonymous.closes)}`,
  );

  await rename(open.http, token, fixture.readable, "readable-two");
  await sleep(SETTLE_MS);
  log(
    `   after a second write, anonymous: ${JSON.stringify(anonymous.received)}`,
  );

  const read = await graphql<{ document: unknown }>(
    open.http,
    `{ document(identifier: "${fixture.withheld}") { document { id } } }`,
  );
  log(
    `   the same document over HTTP: ${read.errors?.[0]?.message ?? "served"}`,
  );

  anonymous.stop();
  admin.stop();
  await sleep(200);
}

async function scenarioThree(token: string): Promise<void> {
  log(
    "3. REQUIRE_AUTHENTICATED_CALLER=true, then a sign-in on the live client",
  );

  if (!(await reachable(requireAuth.http))) {
    log(`   SKIPPED: nothing answers at ${requireAuth.http}`);
    return;
  }

  const fixture = await createFixture(requireAuth.http, token);

  let attempt = 0;
  const signingIn = watch({
    label: "signing-in",
    url: requireAuth.ws,
    connectionParams: () => {
      attempt += 1;
      if (attempt <= 3) return {};
      log(`   attempt ${attempt} carries the bearer`);
      return { authorization: `Bearer ${token}` };
    },
  });
  await sleep(SETTLE_MS);

  await rename(requireAuth.http, token, fixture.readable, "after-sign-in");
  await sleep(SETTLE_MS);

  log(`   attempts=${attempt} closes=${JSON.stringify(signingIn.closes)}`);
  log(`   received after signing in: ${JSON.stringify(signingIn.received)}`);
  log(`   abandoned: ${JSON.stringify(signingIn.abandoned) ?? "no"}`);
  signingIn.stop();
  await sleep(200);
}

async function scenarioFour(token: string): Promise<void> {
  log("4. A bearer that is present and unusable");

  const refused = watch({
    label: "bad-bearer",
    url: open.ws,
    connectionParams: () => ({ authorization: "Bearer not-a-credential" }),
    retryAttempts: 2,
  });
  await sleep(SETTLE_MS);

  log(`   closes=${JSON.stringify(refused.closes)}`);
  log(`   abandoned: ${JSON.stringify(refused.abandoned)}`);
  refused.stop();
  await sleep(200);
}

async function main(): Promise<void> {
  log(`Anonymous subscriptions against ${open.ws}`);
  log(`Admin address: ${ADMIN_ADDRESS}`);

  if (!(await reachable(open.http))) {
    log(
      `Nothing answers at ${open.http}. Start Switchboard first; see README.`,
    );
    process.exitCode = 1;
    return;
  }

  const token = await mintBearer();

  await scenarioZero();
  await scenarioOne();
  await scenarioTwo(token);
  await scenarioThree(token);
  await scenarioFour(token);

  log(
    "A pre-fix Switchboard closes scenario 1 with 4500, and 4500 never retries.",
  );
  process.exit(0);
}

await main();
