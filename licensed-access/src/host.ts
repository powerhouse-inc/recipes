/**
 * A switchboard's API host, booted in-process the way a switchboard boots it:
 * the env an operator sets goes through `reactorApiConfigFromEnv`, and its
 * `auth` block goes to `initializeAndStartAPI`. With `ACCESS=licensed` in that
 * env, the host admits only its `ADMINS` and the callers Vetra's gate allows.
 */
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  initializeAndStartAPI,
  reactorApiConfigFromEnv,
} from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "document-model";

export type HostEnv = Record<string, string | undefined>;

export interface LicensedHost {
  origin: string;
  port: number;
  /** The document policy the host runs among admitted callers. */
  policy: string;
  close(): Promise<void>;
}

const initializeClient = async (documentModels: DocumentModelModule[]) => {
  const builder = new ReactorBuilder()
    .withEventBus(new EventBus())
    .withDocumentModelSources(documentModels)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  return { module };
};

/**
 * Boots a host on an ephemeral port. Rejects when the env is one
 * `ACCESS=licensed` refuses at boot.
 */
export async function startHost(env: HostEnv): Promise<LicensedHost> {
  const { auth } = reactorApiConfigFromEnv(env);
  const api = await initializeAndStartAPI(
    initializeClient,
    {
      port: 0,
      dbPath: undefined, // an in-memory store
      mcp: false,
      // Stands in for Renown's lookup that the credential behind a bearer
      // still exists. The bearer's signature is still verified for real.
      verifyCredential: () => Promise.resolve(true),
      auth,
    },
    "switchboard",
  );
  return {
    origin: `http://127.0.0.1:${api.port}`,
    port: api.port,
    policy: api.authorizationService.config.policy,
    close: () => api.dispose(),
  };
}
