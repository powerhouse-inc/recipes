import {
  BaseSubgraph,
  type CanonicalDocumentId,
  type RouteUser,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
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
      access: {
        canManage: (documentId, user) => this.mayManage(documentId, user),
        canRead: (documentId, user) => this.mayRead(documentId, user),
      },
    });
  }

  /**
   * Who may mint or revoke a subscription's endpoint, and who may read it.
   * Ownership is the reactor's own: `canManage` is true for a host admin, the
   * document's owner, or a holder of an ADMIN grant on it, and `canRead`
   * follows the document's protection. Under the host's policy that means
   * OPEN (auth disabled) allows everyone, ADMIN_ONLY allows the ADMINS list,
   * and DOCUMENT_PERMISSIONS decides per document. Override these to apply a
   * different rule; `user` is undefined for an anonymous caller.
   */
  protected async mayManage(
    documentId: string,
    user: RouteUser | undefined,
  ): Promise<boolean> {
    const id = await this.canonicalId(documentId);
    return (
      id !== undefined && this.authorizationService.canManage(id, user?.address)
    );
  }

  protected async mayRead(
    documentId: string,
    user: RouteUser | undefined,
  ): Promise<boolean> {
    const id = await this.canonicalId(documentId);
    return (
      id !== undefined && this.authorizationService.canRead(id, user?.address)
    );
  }

  /**
   * The authorization service keys on the canonical id, so a slug is resolved
   * first. An id that does not resolve is refused, the same as one the caller
   * may not see.
   */
  private async canonicalId(
    documentId: string,
  ): Promise<CanonicalDocumentId | undefined> {
    try {
      return await this.resolveCanonicalDocumentId(documentId, {});
    } catch {
      return undefined;
    }
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
