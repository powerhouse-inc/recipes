import {
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type IReactor,
  type IReactorClient,
  type ReactorBuilder,
  type SignatureTrustPolicy,
} from "@powerhousedao/reactor";
import type { ISigner } from "document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";

/** A fresh in-memory P-256 key that signs as `address`. */
export async function createSigner(
  appName: string,
  address: string,
): Promise<ISigner> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new RenownCryptoSigner(crypto, appName, {
    address,
    networkId: "eip155",
    chainId: 1,
  });
}

/** Accepts each signer's own key for its address. A host checks a credential. */
export function trustPolicyFor(signers: ISigner[]): SignatureTrustPolicy {
  const keys = new Map(
    signers.map((signer) => [signer.user?.address, signer.app?.key]),
  );
  return {
    authorizeSigner: (signer, key) =>
      Promise.resolve(keys.get(signer.user.address) === key),
  };
}

export type SignedReactor = {
  module: InProcessReactorClientModule;
  reactor: IReactor;
  /** One client per signer, keyed by address, each signing as that signer. */
  clients: Map<string, IReactorClient>;
};

/** A reactor that trusts every signer's key; the first signer is the host. */
export async function buildSignedReactor(
  reactorBuilder: ReactorBuilder,
  signers: ISigner[],
): Promise<SignedReactor> {
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner({ signer: signers[0], trustPolicy: trustPolicyFor(signers) })
    .buildModule();
  const clients = new Map<string, IReactorClient>();
  for (const signer of signers) {
    const client = await new ReactorClientBuilder()
      .withReactor(
        module.reactor,
        module.eventBus,
        module.documentIndexer,
        module.documentView,
      )
      .withSigner(signer)
      .build();
    clients.set(signer.user!.address, client);
  }
  return { module, reactor: module.reactor, clients };
}
