import { describe, expect, it } from "vitest";
import { verifyOperationSignature, hex2ab } from "document-model/core";
import {
  buildDemoOperations,
  buildAndVerifyWithSignAction,
  injectBadOperations,
  verifyAllOperations,
} from "./verify-operations.js";

const ecdsaVerify = async (
  publicKey: string,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> => {
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const importedKey = await crypto.subtle.importKey(
    "raw",
    hex2ab(publicKey),
    algorithm,
    true,
    ["verify"],
  );
  return crypto.subtle.verify(
    algorithm,
    importedKey,
    new Uint8Array(signature),
    new Uint8Array(data),
  );
};

describe("Signed Operations Verifier", () => {
  it("should build signed operations with valid signatures", async () => {
    const { signedOperations } = await buildDemoOperations();

    expect(signedOperations).toHaveLength(3);

    for (const op of signedOperations) {
      const signer = op.action.context?.signer;
      expect(signer).toBeDefined();
      expect(signer!.signatures).toHaveLength(1);
      expect(signer!.user.address).toContain("0x");
      expect(signer!.app.name).toBe("demo-verifier-app");
    }
  });

  it("should verify valid signatures with verifyOperationSignature()", async () => {
    const { signedOperations } = await buildDemoOperations();

    for (const op of signedOperations) {
      const signer = op.action.context!.signer!;
      const signature = signer.signatures[0];
      const valid = await verifyOperationSignature(
        signature,
        signer,
        ecdsaVerify,
      );
      expect(valid).toBe(true);
    }
  });

  it("should detect tampered signatures", async () => {
    const { signedOperations } = await buildDemoOperations();
    const { allOperations, tamperedIndex } =
      injectBadOperations(signedOperations);

    const tampered = allOperations[tamperedIndex];
    const signer = tampered.action.context!.signer!;
    const signature = signer.signatures[0];

    const valid = await verifyOperationSignature(
      signature,
      signer,
      ecdsaVerify,
    );
    expect(valid).toBe(false);
  });

  it("should flag unsigned operations", async () => {
    const { signedOperations } = await buildDemoOperations();
    const { allOperations, unsignedIndex } =
      injectBadOperations(signedOperations);

    const unsigned = allOperations[unsignedIndex];
    expect(unsigned.action.context?.signer).toBeUndefined();

    const results = await verifyAllOperations([unsigned]);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("unsigned");
  });

  it("should produce correct verification report", async () => {
    const { signedOperations } = await buildDemoOperations();
    const { allOperations } = injectBadOperations(signedOperations);

    const results = await verifyAllOperations(allOperations);

    const valid = results.filter((r) => r.status === "valid");
    const invalid = results.filter((r) => r.status === "invalid");
    const unsigned = results.filter((r) => r.status === "unsigned");

    expect(valid).toHaveLength(3);
    expect(invalid).toHaveLength(1);
    expect(unsigned).toHaveLength(1);
  });

  it("should expose signature tuple structure", async () => {
    const { signedOperations } = await buildDemoOperations();
    const sig = signedOperations[0].action.context!.signer!.signatures[0];

    // Signature is a 5-tuple: [timestamp, publicKey, actionHash, prevStateHash, signature]
    expect(sig).toHaveLength(5);
    const [timestamp, publicKey, actionHash, prevStateHash, signatureHex] = sig;

    expect(timestamp).toMatch(/^\d+$/); // unix timestamp
    expect(publicKey).toMatch(/^0x[a-f0-9]+$/); // hex public key
    expect(actionHash).toBeTruthy(); // base64 hash of the action
    expect(typeof prevStateHash).toBe("string"); // may be empty for first op
    expect(signatureHex).toMatch(/^0x[a-f0-9]+$/); // hex ECDSA signature
  });

  it("should extract signer identity chain", async () => {
    const { signedOperations, publicKeyHex } = await buildDemoOperations();

    const signer = signedOperations[0].action.context!.signer!;

    // User identity
    expect(signer.user.address).toBe(
      "eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
    expect(signer.user.networkId).toBe("eip155");
    expect(signer.user.chainId).toBe(1);

    // App identity
    expect(signer.app.name).toBe("demo-verifier-app");
    expect(signer.app.key).toBe(publicKeyHex);
  });

  it("should verify with createSignatureVerifier() via RenownCryptoSigner.signAction()", async () => {
    // createSignatureVerifier() from @renown/sdk is designed to work with
    // signatures produced by RenownCryptoSigner.signAction(), which stores
    // the DID (did:key:z...) in signature[1] — different from buildSignedAction()
    // which stores the raw hex key.
    const result = await buildAndVerifyWithSignAction();

    expect(result.valid).toBe(true);
    expect(result.did).toMatch(/^did:key:z/);
    expect(result.signatureTuple).toHaveLength(5);
    // In the signAction() path, signature[1] is the DID
    expect(result.signatureTuple[1]).toBe(result.did);
  });
});
