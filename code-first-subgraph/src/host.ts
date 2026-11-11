/**
 * The host half, so the recipe can run and be tested outside a deployed
 * switchboard: a real reactor, reactor-api's `GraphQLManager` on the Express
 * adapter, the Apollo gateway, and one WebSocket endpoint for subscriptions.
 * A switchboard does the same in `reactor-api`'s `server.ts`. The host loads
 * a code-first subgraph and a schema-first one through the same call.
 *
 * Auth is disabled, as on a switchboard without `AUTH_ENABLED`: the
 * authorization policy is OPEN and every caller is anonymous.
 */
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  createGatewayAdapter,
  createHttpAdapter,
  GraphQLManager,
  Subgraph,
  type GraphQLManagerOptions,
  type IAuthorizationService,
  type SchemaBuilder,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import {
  documentModelDocumentModelModule,
  ph,
  type ILogger,
} from "document-model";
import { createClient } from "graphql-ws";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const WS_PATH = "/graphql/subscriptions";

export type GraphQLBody = {
  data?: unknown;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
};

export interface SubgraphHost {
  origin: string;
  /** POSTs a query to `path` (`/graphql` or `/graphql/<subgraph>`). */
  post(
    path: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLBody>;
  /**
   * Starts a subscription over the WebSocket endpoint and returns its
   * results as they arrive. Stop it with `return()`.
   */
  subscribe(query: string): AsyncIterableIterator<unknown>;
  close(): Promise<void>;
}

const quiet: ILogger = {
  level: "error",
  verbose: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (...args: unknown[]) => console.error(...args),
  errorHandler: () => () => {},
  child: () => quiet,
} as unknown as ILogger;

/**
 * The host's own subgraph, standing in for a switchboard's system subgraphs.
 * The gateway composes before any package loads, and a supergraph needs a
 * query root to compose.
 */
class HostSubgraph extends Subgraph {
  static override readonly subgraphName = "host";
  static override getSchema(schema: SchemaBuilder<HostSubgraph>) {
    return [
      schema.query("hostPing", {
        type: ph.String({ required: true }),
        resolve: () => "pong",
      }),
    ];
  }
}

/**
 * What a host with auth disabled uses: the OPEN policy, under which every
 * caller, anonymous included, may do everything. reactor-api does not export
 * its own constructor for it, so these are the same answers spelled out.
 */
function openAuthorization(): IAuthorizationService {
  const allow = () => Promise.resolve(true);
  return {
    config: {
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    },
    isSupremeAdmin: () => true,
    canCreate: () => true,
    canRead: allow,
    canWrite: allow,
    canManage: allow,
    canMutate: allow,
  };
}

/**
 * Boots a reactor and a GraphQL host on an ephemeral port, then loads
 * `subgraphs` as one package's, the way the host loads an installed package.
 */
export async function startSubgraphHost(
  packageName: string,
  subgraphs: SubgraphClass[],
): Promise<SubgraphHost> {
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "code-first-subgraph",
  );
  const { read, write } = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ]),
    )
    .withSigner(signer)
    .buildModule();

  const { adapter } = await createHttpAdapter("express");
  const server = (await adapter.listen(0, undefined, "127.0.0.1")) as Server;
  const { port } = server.address() as { port: number };
  const origin = `http://127.0.0.1:${port}`;

  const manager = new GraphQLManager({
    path: "/",
    httpServer: server,
    wsServer: new WebSocketServer({ server, path: WS_PATH }),
    readClient: read,
    writeClient: write,
    // None of these subgraphs use the relational store, analytics or sync.
    relationalDb: {} as GraphQLManagerOptions["relationalDb"],
    analyticsStore: {} as GraphQLManagerOptions["analyticsStore"],
    syncManager: {} as GraphQLManagerOptions["syncManager"],
    logger: quiet,
    httpAdapter: adapter,
    gatewayAdapter: await createGatewayAdapter("apollo", quiet),
    featureFlags: { enableDocumentModelSubgraphs: false },
    port,
    authorizationService: openAuthorization(),
  });
  await manager.init([HostSubgraph]);
  // What the package loader does for each installed package: register its
  // subgraph classes under the package name, then rebuild the router. A
  // code-first class and a BaseSubgraph subclass take the same path.
  await manager.applyPackageSubgraphs(new Map([[packageName, subgraphs]]));
  await manager.updateRouter(true);

  const sockets: ReturnType<typeof createClient>[] = [];

  return {
    origin,
    async post(path, query, variables) {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return (await response.json()) as GraphQLBody;
    },
    subscribe(query) {
      const client = createClient({
        url: `ws://127.0.0.1:${port}${WS_PATH}`,
        webSocketImpl: WebSocket,
        retryAttempts: 0,
      });
      sockets.push(client);
      return client.iterate({ query });
    },
    async close() {
      for (const socket of sockets) await socket.dispose();
      await manager.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
