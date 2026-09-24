import {
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type ReactorClient,
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
export function trustPolicyFor(signers: ISigner[]) {
  const keys = new Map(
    signers.map((signer) => [signer.user?.address, signer.app?.key]),
  );
  return {
    authorizeSigner: (signer: { user: { address: string } }, key: string) =>
      Promise.resolve(keys.get(signer.user.address) === key),
  };
}

/** A second client on `host`'s reactor that signs as `signer`. */
export function clientFor(
  host: InProcessReactorClientModule,
  signer: ISigner,
): Promise<ReactorClient> {
  return new ReactorClientBuilder()
    .withReactor(
      host.reactor,
      host.eventBus,
      host.documentIndexer,
      host.documentView,
    )
    .withSigner(signer)
    .build();
}
