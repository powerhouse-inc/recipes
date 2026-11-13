/**
 * Runs every scenario against an in-process host and a stand-in Vetra, and
 * prints what each caller got.
 */
import "./quiet.js";
import {
  admission,
  bootRules,
  cacheAndLapse,
  graceTimeline,
  outage,
  sockets,
  wrongToken,
} from "./scenarios.js";

function section(title: string) {
  console.log(`\n== ${title}`);
}

function line(label: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  console.log(`  ${label.padEnd(34)} ${text}`);
}

section("1. Admission over HTTP (ACCESS=licensed)");
const a = await admission();
line("anonymous POST /graphql", a.anonymous);
line("stranger (no licence)", `${a.stranger} ${a.strangerBody}`);
line("licence holder", a.holder);
line("admin (in ADMINS)", a.admin);
line("anonymous GET /d/powerhouse", a.anonymousDriveDiscovery);
line("anonymous /health, /ready", `${a.health}, ${a.ready}`);
line("Vetra was asked about", a.askedVetraAbout);
line("Vetra received", {
  ...a.sentToVetra,
  authorization: a.sentToVetra.authorization?.slice(0, 15) + "…",
});
line("document policy", a.policy);

section("2. Cache and lapse (Vetra answers with ttlSeconds: 1)");
const c = await cacheAndLapse();
line("holder, twice", `${c.first}, ${c.second}`);
line("gate calls for both", c.callsWithinTtl);
line("right after Vetra revokes", c.rightAfterRevoke);
line("after the TTL", c.afterTtl);

section("3. WebSockets (WS_CREDENTIAL_RECHECK_INTERVAL_MS=300)");
const s = await sockets();
line("stranger connects", s.stranger);
line("holder connects", s.holderConnected ? "connection_ack" : "refused");
line("holder's socket after revoke", s.holderClosedAfterRevoke);

section("4. Vetra unavailable (503)");
const o = await outage();
line("holder before the outage", o.before);
line("holder during it (grace)", o.holderDuringOutage);
line("newcomer during it (never seen)", o.newcomerDuringOutage);
line("admin during it", o.adminDuringOutage);
line("newcomer once Vetra is back", o.newcomerAfter);

section("5. Vetra refuses the gate token (401)");
const w = await wrongToken();
line("holder", w.holder);
line("admin", w.admin);

section("6. The gate client over an hour (ACCESS_GATE_GRACE_MS=3600000)");
for (const step of await graceTimeline()) {
  line(`${step.at}: ${step.who}`, step.verdict);
}

section("7. Boot rules and policy");
const b = await bootRules();
for (const refusal of b.refusals) line(refusal.env, refusal.error);
line("assertAccessConfig(licensed)", b.preflight);
line("policy, ACCESS=licensed", b.policies.licensed);
line(
  "  + DOCUMENT_PERMISSIONS_ENABLED",
  b.policies.licensedWithDocumentPermissions,
);
line("policy, AUTH_ENABLED only", b.policies.authEnabledWithoutAccess);
