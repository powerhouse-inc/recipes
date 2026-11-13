# Licensed Access

A switchboard run with `ACCESS=licensed` admits only its `ADMINS` and the callers that Vetra's licence gate allows. This is how Vetra runs a shared instance of an app. The recipe boots reactor-api's host in-process from the env an operator sets, points it at a stand-in for Vetra's gate, and sends callers with and without a licence over HTTP and WebSocket. It also takes Vetra down and revokes the instance's token.

The mode ships in `@powerhousedao/reactor-api` 6.2.3-dev.105 (powerhouse#3398). A host that does not set `ACCESS` behaves as before, because the default is `open`.

## What it demonstrates

| Scenario | Result |
|---|---|
| Anonymous `POST /graphql` | `401` |
| A verified caller without a licence | `403 {"error":"No licence for this app"}` |
| A licence holder | `200` |
| An address in `ADMINS` | `200`, and Vetra is never asked about it |
| Anonymous `GET /d/<drive>` (drive discovery) | `401` |
| Anonymous `/health` | `200`. `/ready` answers by readiness, not by caller |
| Two requests from a holder within Vetra's `ttlSeconds` | one gate call |
| Vetra revokes the licence | still `200` until the cached answer expires, then `403` |
| A stranger's WebSocket | closed `4403 bearer-rejected` at connect |
| A holder's open WebSocket after the licence is revoked | closed `4403 credential-revoked` at the next recheck |
| Vetra answers `503` | a holder Vetra allowed recently stays in (grace); a caller Vetra has never answered for is refused, even with a licence; admins stay in |
| Vetra answers `401` (the instance's token is wrong or revoked) | every non-admin is refused; admins stay in |
| `ACCESS=licensed` with no token, an `http` gate off localhost, or `SKIP_CREDENTIAL_VERIFICATION=true` | the host refuses to boot |
| `ACCESS=members` | the host refuses to boot and names `licensed` |
| The document policy | `OPEN` among admitted callers, or `DOCUMENT_PERMISSIONS` when enabled. Never `ADMIN_ONLY`, which `AUTH_ENABLED` alone would give |

## Configuration

These are the env vars a switchboard reads. `reactorApiConfigFromEnv` maps them into `auth.access`, and `src/host.ts` passes that block to `initializeAndStartAPI` as the switchboard does.

```sh
ACCESS=licensed
ADMINS=0xa11ce00000000000000000000000000000000001
VETRA_GATE_URL=https://<vetra>/api/@powerhousedao/vetra-cloud-package/apps/gate/check
VETRA_GATE_TOKEN=vgt_<64 hex>          # a secret; reactor-api never logs it
VETRA_APP_ID=<app id>                  # sent as x-vetra-app-id
ACCESS_GATE_GRACE_MS=86400000          # the default: 24 h
```

`ACCESS=licensed` turns on caller identity and the require-authenticated-caller floor, so there is no need to set `AUTH_ENABLED` or `REQUIRE_AUTHENTICATED_CALLER` as well. `VETRA_GATE_URL` must be `https`. Plain `http` is accepted only on `localhost` or `127.0.0.1`, which is what lets this recipe use a local stand-in.

## The gate contract

`src/vetra.ts` implements the side Vetra owns:

```
POST <VETRA_GATE_URL>
Authorization: Bearer <VETRA_GATE_TOKEN>
x-vetra-app-id: <VETRA_APP_ID>
{ "address": "0x<40 hex, lower case>" }

200 { "allowed": true|false, "reason": "licence"|"none"|..., "until": ISO|null, "ttlSeconds": n }
400, 401   final: never answered from grace
429, 5xx   Vetra is unavailable: grace applies
```

The host caches each answer per address for `ttlSeconds`, clamped to 1–300 s. The stand-in answers with `ttlSeconds: 1` so that a lapse shows up within the demo.

## Grace while Vetra is down

Scenario 6 drives `createVetraAccessGate`, the client the host builds from these settings, with a fake clock. That way an hour of grace runs in milliseconds:

```
12:00: holder                      allowed (gate)
12:00: stranger                    refused (gate)
12:00: holder again                allowed (cache)
12:02 Vetra down: holder           allowed (grace)
12:02 Vetra down: stranger         refused (refused)    a denial is not revived by an outage
13:01 Vetra down: holder           refused (refused)    past ACCESS_GATE_GRACE_MS (1 h here)
13:02 Vetra back: holder           allowed (gate)
13:04 token revoked: holder        refused (refused)    a 401 drops the last yes
13:05 Vetra down: holder           refused (refused)    so there is nothing left to grant grace from
```

The grace store is in memory. If a host restarts while Vetra is down, it admits only `ADMINS` until Vetra answers again. After a failed request, the host waits 5 s before asking Vetra about that address again. That wait is why scenario 4 pauses before the newcomer's last request.

## Files

| File | Contents |
|---|---|
| `src/vetra.ts` | `startFakeVetra`: the gate contract on 127.0.0.1, with a licence set, an outage switch and token rotation |
| `src/host.ts` | `startHost(env)`: `reactorApiConfigFromEnv` → `initializeAndStartAPI` on an ephemeral port, in memory |
| `src/callers.ts` | did:key-signed Renown bearers for the admin, holder, stranger and newcomer, plus HTTP and WebSocket helpers |
| `src/scenarios.ts` | The seven scenarios. Each one boots its own Vetra and host and returns what it observed |
| `src/demo.ts` | Prints every scenario |
| `src/licensed-access.test.ts` | Asserts every scenario |
| `src/quiet.ts` | Sets the log level to `error` before reactor-api loads |

## Running it

```sh
pnpm test
pnpm start
```

No switchboard, database or network access is needed. Bearers are real Renown credentials signed by a did:key, and their signatures are verified. The one stand-in is `verifyCredential`, which on a deployed switchboard asks Renown whether the credential still exists. The recipe injects a verifier that always answers yes.

## Limits

- The stand-in decides from a set of addresses. The real gate decides from the licences of the instance's plan and answers `reason` and `until` accordingly. The host ignores both fields.
- On a deployed shared instance, Vetra delivers the gate settings through its settings delivery. That part is not shown here.
