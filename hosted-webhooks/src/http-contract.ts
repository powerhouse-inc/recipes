/**
 * The HTTP scope contract, copied verbatim from the powerhouse monorepo:
 * `packages/shared/processors/http.ts` on the `feat/core-http-routes` branch
 * (PR powerhouse-inc/powerhouse#2980).
 *
 * The copy exists because the feature is not published. `@powerhousedao/reactor-api`
 * 6.2.2-dev.84, the newest build on the `dev` tag at the time of writing, exports no
 * `IHttpScope`, so a recipe that imported the types would not compile. Once a build
 * carrying the PR is published, delete this file and import the same names from
 * `@powerhousedao/reactor-api`:
 *
 * ```ts
 * import type { IHttpScope, WebhookRequest } from "@powerhousedao/reactor-api";
 * ```
 *
 * Nothing else in the recipe changes: every other file imports these types from
 * here, and the names and shapes are the ones core declares.
 *
 * Refreshed after review of this recipe fed back into the API. Four things moved:
 * a `WebhookField` may now name a header or a nested body path, `WebhookSpec`
 * carries registration values under `defaults` instead of inheriting policy
 * fields, `IWebhookScope` exposes `hasPublicOrigin`, and a declared rate limit
 * binds as written rather than flooring at ten.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * A package's slice of the HTTP surface, and the webhook preset built on it.
 *
 * Declared here rather than in `reactor-api` so there is exactly one such type.
 * Codegen types generated processors against reactor-browser's
 * `IProcessorHostModule`, and the same source has to compile against the
 * reactor's — two structurally similar declarations would drift, and a
 * processor would then have the wrong type in whichever host it was not
 * written against.
 *
 * `http` is optional on the host module for the honest reason: a browser host
 * has no HTTP server, so it is always undefined there. The contract itself is
 * whole, including the Node-shaped escape hatch, because a *type* costs a
 * browser bundle nothing — these imports are erased — and a partial contract
 * would push the difference back into the host modules.
 */

/** Methods a package route may bind. OPTIONS belongs to the CORS layer. */
export type RouteMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

/**
 * The principal a request authenticated as.
 *
 * Not the document model's `User`, which is an address plus ENS for display,
 * nor the browser session's: this is what a verified bearer resolves to on a
 * host that checks one. `reactor-api`'s `User` extends this, so the shape has a
 * single definition.
 */
export interface RouteUser {
  address: string;
  chainId: number;
  networkId: string;
  /**
   * The did:key of the app instance that issued this request's token, taken
   * from the verified credential's issuer.
   *
   * It is the same value a signer presents as its app key when it signs an
   * action, which is what a document records as its creator. Carrying it here
   * is what lets a request decide as the same principal the write path
   * presents, rather than as an address with no key.
   *
   * Authenticated, not asserted: the token is verified by resolving this very
   * DID, so a caller cannot name someone else's.
   */
  appKey: string;
}

/**
 * The caller, as resolved by the scope before the handler runs. `user` is
 * undefined for an anonymous caller — either because auth is disabled host-wide
 * (`authEnabled: false`) or because the route allows anonymous access.
 */
export type RouteActor = {
  user: RouteUser | undefined;
  authEnabled: boolean;
};

export type AuthorizerResult =
  | { authorized: true }
  /** Refused; the scope answers with its own JSON error envelope. */
  | { authorized: false; status: number; message: string }
  /**
   * Refused, with the exact response to send. For an endpoint that speaks a
   * protocol carrying its own error shape — a JSON-RPC endpoint answers a 401
   * with a JSON-RPC error object, not `{"error": "..."}`. Without this, such an
   * endpoint has to declare itself `public` and gate inside the handler, which
   * hides it from an inventory of unauthenticated routes.
   */
  | { authorized: false; response: Response };

/** A route-specific gate, for policies the standard modes cannot express. */
export type RouteAuthorizer = (
  req: IncomingMessage,
) => Promise<AuthorizerResult> | AuthorizerResult;

/**
 * How a route authenticates.
 * - `renown` (default): a verifiable bearer is required; a caller without one
 *   gets 401.
 * - `renown-optional`: a bearer is verified if present, and its absence yields
 *   an anonymous actor instead of a 401. For handlers that make their own
 *   per-document authorization decision.
 * - `public`: no identity is checked. Written out explicitly so that grepping
 *   for it lists every unauthenticated route in the fleet.
 */
export type RouteAuth =
  | "renown"
  | "renown-optional"
  | "public"
  | RouteAuthorizer;

/**
 * How the request body reaches the handler.
 * - `parsed` (default): buffered, and readable through the Fetch Request.
 * - `raw`: buffered and also handed over as `ctx.rawBody`, byte for byte, for
 *   signature verification.
 * - `stream`: not buffered; the Fetch Request body is the live request stream.
 * - `none`: the body is not read at all.
 */
export type RouteBody = "parsed" | "raw" | "stream" | "none";

export interface RouteOptions {
  auth?: RouteAuth;
  body?: RouteBody;
  /** Refuse a body larger than this with 413. Ignored when body is `stream`. */
  maxBodyBytes?: number;
  /**
   * A coarse per-route ceiling, keyed per client. Which client that is depends
   * on whether the host trusts a forwarding proxy: with one in front and no
   * such trust configured, every caller shares the proxy's bucket. A guard
   * against runaway callers, not a defence against a determined one.
   */
  rateLimit?: { perMinute: number };
  /** Serve sub-paths too, not just an exact match. */
  prefix?: boolean;
}

/** Where the request reached the host, resolved through any reverse proxy. */
export interface RouteTransport {
  proto: string;
  host: string;
  prefix: string;
  baseUrl: string;
}

export interface RouteContext {
  /** Decoded path params. */
  params: Record<string, string>;
  /** Resolved by the scope; undefined only when the route is `public`. */
  actor: RouteActor | undefined;
  /** The exact octets received. Present only when body is `raw`. */
  rawBody: Buffer | undefined;
  /** Aborts when the client disconnects. */
  signal: AbortSignal;
  transport: RouteTransport;
}

export type RouteHandler = (
  request: Request,
  ctx: RouteContext,
) => Response | Promise<Response>;

export interface RouteSpec extends RouteOptions {
  method: RouteMethod | RouteMethod[];
  /** Relative to the scope: "runs/:id", never "/api/@scope/pkg/runs/:id". */
  path: string;
  handler: RouteHandler;
}

/**
 * `body` and `maxBodyBytes` are both absent: a node route reads the request
 * stream itself, so the scope has no body to shape and nothing to measure. A
 * cap declared here would be silently inert, and a handler that needs one has
 * to enforce it while reading.
 */
export interface NodeRouteSpec extends Omit<
  RouteOptions,
  "body" | "maxBodyBytes"
> {
  method: RouteMethod | RouteMethod[];
  path: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: Omit<RouteContext, "rawBody" | "signal">,
  ) => void | Promise<void>;
}

/**
 * Handle to a route registered through a scope. Packages hot-reload, so every
 * registration is reversible and disposing a route that is already gone is a
 * no-op.
 */
export interface ScopedRouteHandle {
  /** The absolute public URL this route answers on. */
  readonly url: string;
  dispose(): void;
}

// ── webhooks ───────────────────────────────────────────────────────────────

export type WebhookScheme =
  | "none"
  | "token"
  | "hmac-sha256"
  | "github"
  | "stripe";

export interface WebhookVerification {
  scheme: WebhookScheme;
  /** Resolved value, never a reference — the caller resolves refs. */
  secret?: string;
  /** Overrides the scheme's conventional header. */
  header?: string;
  /** Replay window for timestamped schemes. */
  toleranceSeconds?: number;
}

/**
 * Where to read a value a provider sent.
 *
 * A bare string is the common case: a query parameter, or a top-level body
 * field. The other two forms exist because the providers this supports do not
 * agree — GitHub puts its delivery id in the `x-github-delivery` *header*, and
 * Stripe puts its event id at `data.object.id`, *nested*. Naming only
 * top-level body fields made both undedupable, which is the opposite of the
 * point.
 */
export type WebhookField =
  | string
  | { header: string }
  /** Dot-separated path into the parsed body, e.g. `data.object.id`. */
  | { body: string };

export interface WebhookRequest {
  /** The caller's own key for this endpoint, e.g. a document id. */
  key: string;
  method: string;
  path: string;
  queryParams: Record<string, string>;
  /** Lowercased, with credentials redacted. */
  headers: Record<string, string>;
  /** The exact bytes received. */
  raw: Buffer;
  /** JSON and form bodies decoded; anything else as text. */
  body: unknown;
}

export interface WebhookReply {
  status: number;
  body?: string;
  contentType?: string;
}

/**
 * What core enforces for one endpoint before the handler sees a delivery.
 *
 * Resolved per endpoint rather than per registration, because this is normally
 * document configuration: one package registers once, and each of its
 * endpoints carries its own secret, its own dedupe field and its own idea of
 * which methods are allowed.
 */
export interface WebhookPolicy {
  verify?: WebhookVerification;
  /** Uppercase. Undefined accepts every method. */
  methods?: string[];
  /**
   * A field naming the provider's own delivery id, in the query or at the top
   * level of the body. Every provider redelivers, so this is how a retry is
   * recognised rather than replayed.
   */
  dedupe?: { field: WebhookField; ttlSeconds?: number };
  /**
   * A field a provider echoes back to prove the endpoint exists, before it
   * will register it. Answered without invoking onRequest.
   */
  challengeField?: WebhookField;
  maxBodyBytes?: number;
}

/**
 * One endpoint family a package registers.
 *
 * Deliberately *not* extending `WebhookPolicy`. It used to, which meant every
 * per-endpoint field was also settable here, where it compiles, reads
 * correctly, and is wrong: the policy that actually applies is resolved per
 * endpoint by `policyFor`. A field set here silently backstopped a missing one
 * there. That is how the challenge round came to be skipped for every endpoint
 * — the field was read off the registration and so was never set at all.
 *
 * Registration-level values now live under `defaults`, so the distinction
 * between "a property of the package's integration" and "document
 * configuration this endpoint carries" is visible in the shape.
 */
export interface WebhookSpec {
  /** Distinguishes several endpoint families within one package. */
  name: string;
  /**
   * What a per-endpoint policy merges over. For genuinely fixed properties of
   * the integration — a scheme every endpoint in the family uses, a body cap.
   * Anything an author can change belongs in `policyFor`.
   */
  defaults?: WebhookPolicy;
  onRequest: (request: WebhookRequest) => Promise<WebhookReply> | WebhookReply;
  /**
   * The policy for one endpoint, merged over the registration's own. Returning
   * undefined means the endpoint is not currently armed, which answers exactly
   * as an unknown token does — a prober must not be able to tell a disarmed
   * endpoint from one that never existed.
   */
  policyFor?: (
    key: string,
  ) => Promise<WebhookPolicy | undefined> | WebhookPolicy | undefined;
  rateLimit?: { perMinute: number };
}

export interface WebhookEndpointInfo {
  key: string;
  token: string;
  url: string;
  createdAt: string;
}

export interface IWebhookEndpoints {
  /**
   * The endpoint for a key. The caller owns the key; the service owns the
   * token, which is what makes "never the document id in the URL" structural
   * rather than a rule to remember.
   */
  endpointFor(key: string): Promise<Omit<WebhookEndpointInfo, "key">>;
  revoke(key: string): Promise<void>;
  list(): Promise<WebhookEndpointInfo[]>;
}

export interface IWebhookScope {
  register(spec: WebhookSpec): Promise<IWebhookEndpoints>;
  /**
   * Whether the host knows its own public origin, and so whether
   * `endpointFor().url` is an absolute URL rather than a bare path.
   *
   * A package hands that URL to a third party, which will reject a path. Worth
   * checking before advertising one, and worth surfacing to an operator as a
   * misconfiguration rather than discovering it in a provider's error log.
   */
  readonly hasPublicOrigin: boolean;
}

// ── the scope ──────────────────────────────────────────────────────────────

/**
 * A package's slice of the HTTP surface. Handed to the package already bound
 * to its own namespace: there is no unscoped registrar to reach and no way to
 * express an absolute path, so a package cannot serve outside its own space.
 */
export interface IHttpScope {
  /**
   * Who the scope belongs to: a package's npm name, or the host's name for one
   * of its own route groups. It appears in the path for a package scope and
   * not for a host one, so read it as an identity, never as a URL fragment —
   * take the path from `baseUrl`.
   */
  readonly owner: string;
  /**
   * Absolute public base every route in the scope hangs off, e.g.
   * `https://host/api/@scope/pkg`. Degrades to a path only when the host
   * cannot know its own origin.
   */
  readonly baseUrl: string;

  get(path: string, handler: RouteHandler): ScopedRouteHandle;
  get(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  post(path: string, handler: RouteHandler): ScopedRouteHandle;
  post(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  put(path: string, handler: RouteHandler): ScopedRouteHandle;
  put(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  patch(path: string, handler: RouteHandler): ScopedRouteHandle;
  patch(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  delete(path: string, handler: RouteHandler): ScopedRouteHandle;
  delete(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  /** Registered independently of GET: a HEAD response is not a GET with the body dropped. */
  head(path: string, handler: RouteHandler): ScopedRouteHandle;
  head(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;

  route(spec: RouteSpec): ScopedRouteHandle;

  /**
   * For protocols that must own the socket — a hijacked connection, a
   * long-lived stream the Fetch shape cannot express. Still inside the
   * namespace, so the escape hatch does not escape the prefix.
   *
   * The request arrives unread and byte-exact: nothing has touched the stream,
   * so the handler may parse it, verify a signature over the octets, or hand
   * it to a protocol implementation that reads it itself.
   */
  nodeRoute(spec: NodeRouteSpec): ScopedRouteHandle;

  /**
   * Token-addressed inbound endpoints for third-party providers. Separate from
   * the routes above because a webhook is a different kind of surface: the
   * caller holds no credentials, so the URL is the credential; the bytes are
   * cryptographically load-bearing; redeliveries are expected; and providers
   * probe before they will register.
   */
  readonly webhooks: IWebhookScope;

  /** Release every route this scope registered. Called on package teardown. */
  dispose(): void;
}
