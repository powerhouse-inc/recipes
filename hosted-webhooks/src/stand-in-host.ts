/**
 * A stand-in for the reactor's own route and webhook services, so this recipe
 * runs before the feature is published.
 *
 * It is NOT part of what the recipe teaches, and it is not what you deploy
 * against. On a reactor, `HttpRouteService` and `WebhookService` (in
 * `@powerhousedao/reactor-api`) do this work, a subgraph receives the scope as
 * `this.http`, and deliveries arrive over the network. This file exists so
 * `pnpm start` and `pnpm test` can drive the same registration code today.
 *
 * What it reproduces, from `packages/reactor-api/src/http/webhook-service.ts`:
 * the refusal order (unknown token, disarmed, method, body cap, signature,
 * challenge, dedupe, handler), the shared 404 for an unknown and a disarmed
 * endpoint, the 200-with-empty-body answer to a redelivery, header redaction,
 * and opaque tokens that are stable per key. What it leaves out: rate limiting,
 * every verification scheme except `stripe`, the relational token store, and
 * the two adapters. Core is the authority on all of it.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  IHttpScope,
  IWebhookScope,
  NodeRouteSpec,
  RouteActor,
  RouteContext,
  RouteHandler,
  RouteMethod,
  RouteOptions,
  RouteSpec,
  ScopedRouteHandle,
  WebhookPolicy,
  WebhookSpec,
} from "./http-contract.js";

const REDACTED = "[redacted]";
const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "stripe-signature",
  "x-api-key",
  "x-signature",
  "x-webhook-token",
]);
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_TOLERANCE_SECONDS = 300;

interface Registered {
  spec: RouteSpec;
  pattern: RegExp;
  keys: string[];
}

interface TokenRow {
  endpoint: string;
  key: string;
  token: string;
  createdAt: string;
}

export interface StandInHostOptions {
  /** The npm name whose namespace the scope is bound to. */
  packageName: string;
  publicUrl: string;
  /** False models a host with auth disabled, where every route sees an anonymous actor. */
  authEnabled?: boolean;
  /** Resolves a bearer token to an address, as a verifying host would. */
  bearer?: (token: string) => string | undefined;
  now?: () => number;
}

/** A delivery as a provider would send it. */
export interface Delivery {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
}

export class StandInHost {
  readonly scope: IHttpScope;
  readonly #routes: Registered[] = [];
  readonly #specs = new Map<string, WebhookSpec>();
  readonly #tokens: TokenRow[] = [];
  readonly #seen = new Map<string, number>();
  readonly #options: StandInHostOptions;
  readonly #base: string;

  constructor(options: StandInHostOptions) {
    this.#options = options;
    const segments = options.packageName.startsWith("@")
      ? options.packageName.split("/")
      : [options.packageName];
    this.#base = `/api/${segments.join("/")}`;

    const register = (spec: RouteSpec | NodeRouteSpec): ScopedRouteHandle => {
      if (spec.path.startsWith("/")) {
        throw new Error(`Route path "${spec.path}" must be relative`);
      }
      if ("handler" in spec && spec.handler.length > 2) {
        throw new Error("The stand-in host does not serve nodeRoute handlers");
      }
      const keys: string[] = [];
      const pattern = new RegExp(
        `^${this.#base}/${spec.path.replace(/:([^/]+)/g, (_m, key: string) => {
          keys.push(key);
          return "([^/]+)";
        })}$`,
      );
      const entry: Registered = { spec: spec as RouteSpec, pattern, keys };
      this.#routes.push(entry);
      return {
        url: `${options.publicUrl}${this.#base}/${spec.path}`,
        dispose: () => {
          const at = this.#routes.indexOf(entry);
          if (at >= 0) this.#routes.splice(at, 1);
        },
      };
    };

    const shorthand =
      (method: RouteMethod) =>
      (
        path: string,
        a: RouteOptions | RouteHandler,
        b?: RouteHandler,
      ): ScopedRouteHandle => {
        const options_ = typeof a === "function" ? {} : a;
        const handler = typeof a === "function" ? a : b;
        if (!handler) throw new Error(`Route ${method} ${path} has no handler`);
        return register({ ...options_, method, path, handler });
      };

    const webhooks: IWebhookScope = {
      register: async (spec: WebhookSpec) => {
        this.#specs.set(spec.name, spec);
        return {
          endpointFor: async (key: string) => {
            const row = this.#ensure(spec.name, key);
            return {
              token: row.token,
              url: `${options.publicUrl}/webhooks/${row.token}`,
              createdAt: row.createdAt,
            };
          },
          revoke: async (key: string) => {
            const at = this.#tokens.findIndex(
              (row) => row.endpoint === spec.name && row.key === key,
            );
            if (at >= 0) this.#tokens.splice(at, 1);
          },
          list: async () =>
            this.#tokens
              .filter((row) => row.endpoint === spec.name)
              .map((row) => ({
                key: row.key,
                token: row.token,
                url: `${options.publicUrl}/webhooks/${row.token}`,
                createdAt: row.createdAt,
              })),
        };
      },
    };

    this.scope = {
      owner: options.packageName,
      baseUrl: `${options.publicUrl}${this.#base}`,
      webhooks,
      get: shorthand("GET"),
      post: shorthand("POST"),
      put: shorthand("PUT"),
      patch: shorthand("PATCH"),
      delete: shorthand("DELETE"),
      head: shorthand("HEAD"),
      route: (spec: RouteSpec) => register(spec),
      nodeRoute: (spec: NodeRouteSpec) => register(spec),
      dispose: () => {
        this.#routes.length = 0;
        this.#specs.clear();
      },
    };
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }

  #ensure(endpoint: string, key: string): TokenRow {
    const existing = this.#tokens.find(
      (row) => row.endpoint === endpoint && row.key === key,
    );
    if (existing) return existing;
    const row: TokenRow = {
      endpoint,
      key,
      token: randomBytes(16).toString("hex"),
      createdAt: new Date(this.#now()).toISOString(),
    };
    this.#tokens.push(row);
    return row;
  }

  /** Calls a registered route, as the reactor's router would. */
  async request(
    method: RouteMethod,
    path: string,
    init: { bearer?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const pathname = path.startsWith("/") ? path : `${this.#base}/${path}`;
    const match = this.#routes.find(
      (entry) =>
        (Array.isArray(entry.spec.method)
          ? entry.spec.method.includes(method)
          : entry.spec.method === method) && entry.pattern.exec(pathname),
    );
    if (!match) return Response.json({ error: "Not found" }, { status: 404 });

    const groups = match.pattern.exec(pathname)!.slice(1);
    const params = Object.fromEntries(
      match.keys.map((key, at) => [key, decodeURIComponent(groups[at]!)]),
    );

    const actor = this.#authenticate(match.spec.auth ?? "renown", init.bearer);
    if (actor === "refused") {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const request = new Request(`${this.#options.publicUrl}${pathname}`, {
      method,
      headers: init.headers,
      body: init.body,
    });
    const raw = init.body === undefined ? undefined : Buffer.from(init.body);
    if (raw && raw.byteLength > (match.spec.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }

    const ctx: RouteContext = {
      params,
      actor,
      rawBody: match.spec.body === "raw" ? raw : undefined,
      signal: new AbortController().signal,
      transport: {
        proto: "https",
        host: new URL(this.#options.publicUrl).host,
        prefix: "",
        baseUrl: this.#options.publicUrl,
      },
    };

    try {
      return await match.spec.handler(request, ctx);
    } catch {
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  #authenticate(
    auth: RouteSpec["auth"],
    bearer: string | undefined,
  ): RouteActor | undefined | "refused" {
    const authEnabled = this.#options.authEnabled ?? true;
    if (auth === "public") return undefined;
    if (typeof auth === "function") return undefined;
    if (!authEnabled) return { user: undefined, authEnabled: false };

    const address = bearer ? this.#options.bearer?.(bearer) : undefined;
    if (!address) {
      return auth === "renown-optional"
        ? { user: undefined, authEnabled }
        : "refused";
    }
    return {
      user: { address, chainId: 1, networkId: "eip155", appKey: "did:key:demo" },
      authEnabled,
    };
  }

  /** Delivers to `/webhooks/:token`, in the order core applies its checks. */
  async deliver(token: string, delivery: Delivery = {}): Promise<Response> {
    const unknown = () =>
      Response.json({ error: "Unknown endpoint" }, { status: 404 });

    const row = this.#tokens.find((entry) => entry.token === token);
    if (!row) return unknown();
    const spec = this.#specs.get(row.endpoint);
    if (!spec) {
      return Response.json(
        { error: "Endpoint temporarily unavailable" },
        { status: 503 },
      );
    }

    const perEndpoint = spec.policyFor ? await spec.policyFor(row.key) : {};
    if (!perEndpoint) return unknown();
    const policy: WebhookPolicy = { ...spec, ...perEndpoint };

    const method = (delivery.method ?? "POST").toUpperCase();
    if (policy.methods && !policy.methods.includes(method)) {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const raw = Buffer.from(delivery.body ?? "");
    if (raw.byteLength > (policy.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }

    const headers = Object.fromEntries(
      Object.entries(delivery.headers ?? {}).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    );
    if (policy.verify && !this.#verified(policy, headers, raw)) {
      return Response.json(
        { error: "Signature verification failed" },
        { status: 401 },
      );
    }

    const queryParams = delivery.query ?? {};
    const body = parseBody(raw, headers["content-type"]);

    const challenge = policy.challengeField
      ? fieldValue(policy.challengeField, queryParams, body)
      : undefined;
    if (challenge !== undefined) {
      return new Response(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }

    if (policy.dedupe) {
      const key = fieldValue(policy.dedupe.field, queryParams, body);
      if (key !== undefined) {
        const seenKey = `${token}|${key}`;
        const until = this.#seen.get(seenKey);
        if (until !== undefined && until > this.#now()) {
          // A redelivery answers as though it worked, and runs nothing twice.
          return new Response(null, { status: 200 });
        }
        this.#seen.set(
          seenKey,
          this.#now() + (policy.dedupe.ttlSeconds ?? 300) * 1000,
        );
      }
    }

    const reply = await spec.onRequest({
      key: row.key,
      method,
      path: `/webhooks/${token}`,
      queryParams,
      headers: Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
          name,
          REDACTED_HEADERS.has(name) ? REDACTED : value,
        ]),
      ),
      raw,
      body,
    });

    return new Response(reply.body ?? null, {
      status: reply.status,
      headers: reply.body
        ? { "content-type": reply.contentType ?? "text/plain" }
        : undefined,
    });
  }

  #verified(
    policy: WebhookPolicy,
    headers: Record<string, string>,
    raw: Buffer,
  ): boolean {
    const verify = policy.verify!;
    if (verify.scheme === "none") return true;
    if (verify.scheme !== "stripe") {
      throw new Error(
        `The stand-in host only verifies the "stripe" scheme, not "${verify.scheme}"`,
      );
    }
    const secret = verify.secret;
    if (!secret) return false;
    const presented = headers[verify.header ?? "stripe-signature"];
    if (!presented) return false;

    const parts = presented.split(",").map((part) => part.trim());
    const timestamp = Number(
      parts.find((part) => part.startsWith("t="))?.slice(2),
    );
    if (!Number.isFinite(timestamp)) return false;
    const tolerance = verify.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (Math.abs(this.#now() / 1000 - timestamp) > tolerance) return false;

    const expected = createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), raw]))
      .digest("hex");
    return parts
      .filter((part) => part.startsWith("v1="))
      .some((part) => equal(part.slice(3), expected));
  }
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/**
 * The signature Stripe sends, over the exact bytes. Re-serializing the body
 * before signing, or before verifying, breaks it.
 */
export function stripeSignature(
  secret: string,
  raw: string,
  timestampSeconds: number,
): string {
  const signature = createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestampSeconds}.`), Buffer.from(raw)]))
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

function parseBody(raw: Buffer, contentType: string | undefined): unknown {
  if (raw.byteLength === 0) return undefined;
  const text = raw.toString("utf8");
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      // A malformed body is still evidence, so it arrives as text.
      return text;
    }
  }
  return text;
}

/** Query string first, then a top-level body field. Never a nested one. */
function fieldValue(
  field: string,
  queryParams: Record<string, string>,
  body: unknown,
): string | undefined {
  const fromQuery = queryParams[field];
  if (typeof fromQuery === "string" && fromQuery !== "") return fromQuery;
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}
