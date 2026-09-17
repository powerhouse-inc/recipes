# Anonymous Subscriptions

A WebSocket client that carries no `authorization` in its `connectionParams`
connects to an auth-enabled Switchboard, receives `connection_ack`, and stays
connected. Each admitted subscription authorizes per document, inside the
`withFilter` predicates of `documentChanges` and `jobChanges`. Refusing an
anonymous caller belongs to `REQUIRE_AUTHENTICATED_CALLER`, and that refusal
closes `4403`, which graphql-ws retries.

## What it demonstrates

- **A tokenless connection is admitted**: against `AUTH_ENABLED=true` the
  anonymous socket reports `connects=1` and `closes=[]`.
- **A document the caller may not read arrives as nothing**: the admin socket
  receives `["readable-one","withheld-one"]` while the anonymous socket
  receives `["readable-one"]`, with no error, no `complete`, and no close.
- **The feed survives the withheld event**: the next write to the readable
  document still arrives, leaving the anonymous socket at
  `["readable-one","readable-two"]`.
- **`REQUIRE_AUTHENTICATED_CALLER=true` closes 4403**: the client retries
  through three `4403 authentication-required` closes, and the fourth attempt
  carries a bearer, connects, and receives `["after-sign-in"]`.
- **A bearer that is present and unusable is refused**: `Bearer
  not-a-credential` closes `4403 bearer-rejected` on the server that admits
  anonymous callers.
- **The reason, not the code, says which refusal it was**: both refusals close
  `4403`, and only the reason distinguishes "sign in and this will work" from
  "the bearer you sent is not usable".
- **A Switchboard without the fix acks and then closes 4500**: the same
  tokenless client records
  `{"code":4500,"reason":"Missing authorization in connection parameters"}` and
  gives up on that first close.

## Why 4403 and not 4401

graphql-ws keeps one list of close codes after which the client never
reconnects. `shouldRetryConnectOrThrow` in `graphql-ws/dist/client.js` reads:

```js
CloseCode.InternalServerError,   // 4500
CloseCode.InternalClientError,
CloseCode.BadRequest,
CloseCode.BadResponse,
CloseCode.Unauthorized,          // 4401
// CloseCode.Forbidden, might grant access out after retry
CloseCode.SubprotocolNotAcceptable,
CloseCode.SubscriberAlreadyExists,
CloseCode.TooManyInitialisationRequests
```

A code in that list is thrown to the caller before `retryAttempts` is even
read. `4401` sits there beside `4500`, so closing `4401` would leave the socket
as dead as closing `4500` does. `4403` is commented out of the list, so
`retryAttempts` governs it.

Because both refusals share that one code, the reason carries what the code
cannot. `reactor-api` exports the two it closes with,
`WS_CLOSE_REASON_AUTHENTICATION_REQUIRED` (`authentication-required`) and
`WS_CLOSE_REASON_BEARER_REJECTED` (`bearer-rejected`), and `reactor-browser`
matches the same set in `isAuthRefusalClose`. A close reason caps at 123 UTF-8
bytes, which is why they are slugs and not sentences. This recipe drives
graphql-ws directly, so it retries on its own `retryAttempts`; the platform
client instead declines to retry an auth refusal and reopens the socket when
the credentials change, since repeating the same ones cannot change the
answer.

Before the fix, `authenticateWebSocketConnection` threw for a missing
`authorization`, and graphql-ws ran that function as its `context` option, once
per operation. So the handshake acked and the first `subscribe` threw.
graphql-ws treats a throw from `context` as a server fault, closes `4500`, and
forwards the throw's message as the close reason. That is where the pre-fix
reason `Missing authorization in connection parameters` comes from. Signing in
did not revive such a feed, and only a page reload did.

## What silence means to a subscriber

Scenario 2 protects one of two documents with `setDocumentProtection`, then
renames both. The anonymous subscriber sees the rename of the unprotected
document and receives nothing for the protected one. Reading that same
protected document over HTTP answers `Forbidden: insufficient permissions to
read this document`. A subscriber therefore cannot tell a document that did not
change from a document it may not read. SSE at `/graphql/stream` answers the
same way, because both transports run the same `withFilter` predicate.

The delivering socket in that scenario carries an admin's bearer, and
`isSupremeAdmin` short-circuits the per-document check for that address. A
bearer naming a non-admin address with no grant on the protected document would
meet the same silence the anonymous socket meets.

`DOCUMENT_PERMISSIONS_ENABLED=true` is what makes this scenario per document.
`AUTH_ENABLED=true` on its own selects `ADMIN_ONLY`, whose `canRead` answers
`isSupremeAdmin` for every document, so the anonymous socket would then receive
nothing at all. The `setDocumentProtection` mutation also exists only under
document permissions.

`DEFAULT_PROTECTION=false` is what leaves the first document readable by
everyone. Set it to `true` and the anonymous socket receives `[]`, still with
no error and no close.

## Running it

Switchboard writes a `.ph` directory into the working directory, so start each
server from its own empty directory. The published package needs no checkout.

The server the first two scenarios use, on port 4101:

```sh
PH_PGLITE_IN_MEMORY=1 \
PH_SWITCHBOARD_PORT=4101 \
AUTH_ENABLED=true \
DOCUMENT_PERMISSIONS_ENABLED=true \
DEFAULT_PROTECTION=false \
ADMINS=0xa11ce00000000000000000000000000000000001 \
SKIP_CREDENTIAL_VERIFICATION=true \
ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true \
npx @powerhousedao/switchboard@6.2.3-dev.11
```

The server scenario 3 uses, on port 4102, which adds one variable:

```sh
PH_PGLITE_IN_MEMORY=1 \
PH_SWITCHBOARD_PORT=4102 \
AUTH_ENABLED=true \
DOCUMENT_PERMISSIONS_ENABLED=true \
DEFAULT_PROTECTION=false \
REQUIRE_AUTHENTICATED_CALLER=true \
ADMINS=0xa11ce00000000000000000000000000000000001 \
SKIP_CREDENTIAL_VERIFICATION=true \
ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true \
npx @powerhousedao/switchboard@6.2.3-dev.11
```

`ADMINS` must equal `ADMIN_ADDRESS` in `src/config.ts`. The demo mints its own
did:key credential for that address, which `SKIP_CREDENTIAL_VERIFICATION` and
`ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION` together let through. Minting is
the only thing `@renown/sdk` is used for here.

Then run the demo:

```sh
pnpm install
pnpm --filter @powerhousedao/example-anonymous-subscriptions start
```

Scenario 0 needs a third Switchboard that lacks the fix, started with the port
4101 environment and `PH_SWITCHBOARD_PORT=4103`. Any release through
`6.2.3-dev.3` shows the old behaviour, so run
`npx @powerhousedao/switchboard@6.2.3-dev.3` there. Point the demo at it:

```sh
pnpm --filter @powerhousedao/example-anonymous-subscriptions start -- \
  --pre-fix-ws ws://localhost:4103/graphql/subscriptions
```

The server logs its own side of each refusal. Port 4102 writes `Refusing
anonymous WebSocket connection: an authenticated caller is required`, and port
4101 writes `Refusing WebSocket connection: Token verification failed` for the
unusable bearer.

## Example output

```
0. The same anonymous subscription against a Switchboard without the fix
  pre-fix  : connected (ack received)
  pre-fix  : socket closed 4500 Missing authorization in connection parameters
  pre-fix  : gave up: {"code":4500,"reason":"Missing authorization in connection parameters"}
1. An anonymous subscription against an auth-enabled Switchboard
  anonymous: connected (ack received)
   connects=1 closes=[] abandoned=no
2. What the anonymous caller receives, per document
   anonymous received: ["readable-one"]
   admin received:     ["readable-one","withheld-one"]
   anonymous errors=[] closes=[]
   after a second write, anonymous: ["readable-one","readable-two"]
   the same document over HTTP: Forbidden: insufficient permissions to read this document
3. REQUIRE_AUTHENTICATED_CALLER=true, then a sign-in on the live client
  signing-in: socket closed 4403 authentication-required
  signing-in: socket closed 4403 authentication-required
  signing-in: socket closed 4403 authentication-required
   attempt 4 carries the bearer
  signing-in: connected (ack received)
   received after signing in: ["after-sign-in"]
   abandoned: no
4. A bearer that is present and unusable
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: socket closed 4403 bearer-rejected
  bad-bearer: gave up: {"code":4403,"reason":"bearer-rejected"}
   abandoned: {"code":4403,"reason":"bearer-rejected"}
```

Scenario 4 sets `retryAttempts: 2`, so three closes are recorded: the first
connect and two retries. Scenario 3's closes carry the same `4403`, and the
reason is what separates them: `authentication-required` is answered by signing
in, which attempt 4 does, while `bearer-rejected` is answered by nothing the
client can retry.

## Version requirement

Scenarios 1 through 4 need Switchboard `6.2.3-dev.4` or newer. That release
carries both commits this recipe reads: `bb20f8945`, "fix(reactor-api): answer
a tokenless websocket as the http path does", and `f773b8e671`, "fix: say why a
websocket auth refusal closed, and retry on that answer", which replaced
graphql-ws's own `Forbidden` close reason with the two named ones. The output
above was recorded against `6.2.3-dev.11`, the current `dev` tag.

Every release through `6.2.3-dev.3` acks a tokenless connection and then closes
`4500 Missing authorization in connection parameters` on the first `subscribe`,
and the client abandons the socket. Scenario 0 needs one of those.

The repo catalog pins `6.2.3-dev.11`, which this recipe uses only for
`@renown/sdk` to mint a bearer. The Switchboard it runs against is a separate
install, so the two do not have to match.
