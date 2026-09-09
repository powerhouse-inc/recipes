/**
 * The host half of the wiring, so the recipe can be run and tested outside a
 * deployed reactor.
 *
 * Every moving part is core's own: the Express HTTP adapter, `HttpRouteService`
 * as the dispatcher, `WebhookService` over a `MemoryWebhookStore`, and the
 * same `hostScope` mount the reactor uses for the `/webhooks/:token` family.
 * A deployed reactor does exactly this in `reactor-api`'s `server.ts`, with a
 * `RelationalWebhookStore` in place of the in-memory one so a URL a provider
 * has registered survives a restart and any replica can serve it.
 *
 * What this means for the tests: they speak real HTTP to a real socket, and
 * every refusal — the token lookup, the replay window, the signature over the
 * received octets, dedupe, the method check — is core's code, not a
 * reimplementation of it.
 */
import {
  CORE_PACKAGE_NAME,
  createHttpAdapter,
  HttpRouteService,
  MemoryWebhookStore,
  WEBHOOK_SEGMENT,
  WebhookService,
  type AuthService,
  type IHttpScope,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import posix from "node:path/posix";

export interface HostOptions {
  /**
   * Absent means auth is disabled host-wide, and every route sees an anonymous
   * actor — which is also the only way a `renown` route admits a caller with no
   * bearer.
   */
  authService?: AuthService;
  basePath?: string;
}

export interface ReactorHost {
  /** Where the host is reachable. Also what the minted webhook URLs name. */
  publicUrl: string;
  /**
   * A package's namespaced slice of the URL space. Inside a reactor this is
   * what arrives as `subgraph.http`; here the caller passes it in.
   */
  scopeFor(packageName: string): IHttpScope;
  close(): Promise<void>;
}

/** Boots an HTTP host on an ephemeral port and returns the handles a package needs. */
export async function startHost(options: HostOptions = {}): Promise<ReactorHost> {
  const basePath = options.basePath ?? "/";
  const { adapter } = await createHttpAdapter("express");
  // Installs CORS and the body parsers — and, ahead of them, the raw dispatch
  // a signed webhook cannot do without: behind a parser the request stream is
  // spent and only a re-encoded body survives, which no longer matches the
  // signature the provider computed.
  adapter.setupMiddleware({});

  // Listening first is what makes the origin knowable: the port is assigned by
  // the OS, and `publicUrl` has to be a real origin before any endpoint is
  // minted, or a provider is handed a bare path it cannot call.
  const server = await adapter.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const publicUrl = `http://127.0.0.1:${port}`;

  const webhooks = new WebhookService({
    store: new MemoryWebhookStore(),
    basePath,
    publicUrl,
  });
  const httpRoutes = new HttpRouteService({
    httpAdapter: adapter,
    basePath,
    publicUrl,
    webhooks,
    authService: options.authService,
  });
  // The endpoint family serves from a host scope rather than straight off the
  // adapter, so package routes and webhooks share one dispatch path. The mount
  // is verbatim and outside the package prefix, so a package can never shadow
  // it.
  webhooks.attach(
    httpRoutes.hostScope(
      CORE_PACKAGE_NAME,
      posix.join("/", basePath, WEBHOOK_SEGMENT),
    ),
  );

  return {
    publicUrl,
    scopeFor: (packageName) => httpRoutes.scopeFor(packageName),
    close: async () => {
      // What the host does on shutdown, and what makes a package's own
      // teardown hook unnecessary.
      httpRoutes.disposeAll();
      webhooks.dispose();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

/**
 * The `SubgraphArgs` a reactor injects, narrowed to the two fields this
 * package's `onSetup` reads. The rest — the GraphQL manager, the relational
 * db, the sync manager, the authorization service — is plumbing the reactor
 * owns and this recipe never touches, so standing it up outside one would
 * teach nothing. One cast, in one place, rather than at every call site.
 */
export function subgraphArgs(
  args: Pick<SubgraphArgs, "http" | "reactorClient">,
): SubgraphArgs {
  return args as unknown as SubgraphArgs;
}
