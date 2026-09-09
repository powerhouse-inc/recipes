import { BaseSubgraph, type SubgraphArgs } from "@powerhousedao/reactor-api";
import {
  registerSubscriptionEndpoints,
  type SubscriptionEndpoints,
} from "./subscription-endpoint.js";

/**
 * The package's HTTP surface, hung off the scope the reactor hands a subgraph.
 *
 * A subgraph rather than a processor: `this.http` is the package's namespaced
 * slice of the URL space, and it arrives on `SubgraphArgs`. A processor is
 * driven by operations flowing out of the reactor, and nothing here is — the
 * traffic arrives from Stripe, and the document is the *result*. The GraphQL
 * half of a subgraph is inherited unchanged; only `onSetup` matters.
 *
 * There is no `onDisconnect`: the host disposes a package's scope when the
 * package is torn down and again on shutdown, which releases the routes and
 * the webhook registration. Releasing them here as well would be a second
 * owner for the same lifetime.
 */
export class SubscriptionWebhooksSubgraph extends BaseSubgraph {
  override name = "subscription-webhooks";

  /** Set once `onSetup` has run, for a caller that wants the minted endpoints. */
  endpoints: SubscriptionEndpoints | undefined;

  constructor(args: SubgraphArgs) {
    super(args);
  }

  override async onSetup(): Promise<void> {
    this.endpoints = await registerSubscriptionEndpoints(this.http, {
      reactorClient: this.reactorClient,
      secretFor: (documentId) => this.secretFor(documentId),
    });
  }

  /**
   * The Stripe signing secret for one subscription. A deployment with one
   * Stripe account has one secret, which is what the manifest's
   * `STRIPE_WEBHOOK_SECRET` is; override this to read a per-document secret
   * from wherever the host keeps them. It must never come from document state,
   * which is readable by anyone who can read the document.
   */
  protected secretFor(_documentId: string): Promise<string | undefined> {
    return Promise.resolve(process.env.STRIPE_WEBHOOK_SECRET);
  }
}
