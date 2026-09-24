import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  USER,
  buildDemoOperations,
  buildLegacyOperation,
  canonicalJson,
  injectBadOperations,
  verifyAllOperations,
  verifyOperation,
} from "./verify-operations.js";

describe("Signed Operations Verifier", () => {
  it("signs every operation with the signer's did:key and identity", async () => {
    const { signedOperations, renownCrypto } = await buildDemoOperations();

    expect(signedOperations).toHaveLength(3);
    for (const op of signedOperations) {
      const signer = op.action.context!.signer!;
      expect(signer.signatures).toHaveLength(1);
      expect(signer.user).toEqual(USER);
      expect(signer.app).toEqual({ name: APP_NAME, key: renownCrypto.did });
      expect(signer.signatures[0][1]).toBe(renownCrypto.did);
    }
  });

  it("verifies the operations the signer produced", async () => {
    const { signedOperations, target } = await buildDemoOperations();

    const results = await verifyAllOperations(signedOperations, target);

    expect(results.map((r) => r.status)).toEqual(["valid", "valid", "valid"]);
  });

  it("exposes the signature tuple structure", async () => {
    const { signedOperations } = await buildDemoOperations();
    const [timestamp, key, actionHash, prevStateHash, signatureHex] =
      signedOperations[0].action.context!.signer!.signatures[0];

    expect(timestamp).toMatch(/^\d+$/);
    expect(key).toMatch(/^did:key:z/);
    // v2 where the signer takes a target, the legacy base64 hash before
    expect(actionHash).toMatch(/^(v2:[A-Za-z0-9_-]{43}|[A-Za-z0-9+/]{43}=)$/);
    expect(typeof prevStateHash).toBe("string");
    expect(signatureHex).toMatch(/^0x[0-9a-f]{128}$/);
  });

  it("refuses a tampered signature", async () => {
    const { signedOperations, target } = await buildDemoOperations();
    const { allOperations, tamperedIndex } =
      injectBadOperations(signedOperations);

    const result = await verifyOperation(allOperations[tamperedIndex], target);

    expect(result.status).toBe("invalid");
    expect(["MALFORMED_TUPLE", "BAD_SIGNATURE"]).toContain(result.code);
  });

  it("refuses input edited after signing", async () => {
    const { signedOperations, target } = await buildDemoOperations();
    const { allOperations, editedIndex } =
      injectBadOperations(signedOperations);

    const result = await verifyOperation(allOperations[editedIndex], target);

    expect(result.status).toBe("invalid");
    expect(result.code).toBe("HASH_MISMATCH");
  });

  it("flags unsigned operations", async () => {
    const { signedOperations, target } = await buildDemoOperations();
    const { allOperations, unsignedIndex } =
      injectBadOperations(signedOperations);

    const result = await verifyOperation(allOperations[unsignedIndex], target);

    expect(result.status).toBe("unsigned");
  });

  it("refuses a tuple whose key is not signer.app.key", async () => {
    const { signedOperations, target } = await buildDemoOperations();
    const op = structuredClone(signedOperations[0]);
    op.action.context!.signer!.app.key = "did:key:zSomeoneElse";

    const result = await verifyOperation(op, target);

    expect(result.code).toBe("KEY_MISMATCH");
  });

  it("produces the verification report counts", async () => {
    const { signedOperations, target } = await buildDemoOperations();
    const { allOperations } = injectBadOperations(signedOperations);

    const results = await verifyAllOperations(allOperations, target);
    const count = (status: string) =>
      results.filter((r) => r.status === status).length;

    expect(count("valid")).toBe(3);
    expect(count("invalid")).toBe(2);
    expect(count("unsigned")).toBe(1);
  });

  it("binds a v2 tuple to its document, and a legacy tuple to none", async () => {
    const { signedOperations } = await buildDemoOperations();
    const elsewhere = { documentId: "another-document", branch: "main" };

    const result = await verifyOperation(signedOperations[0], elsewhere);

    if (result.scheme === "v2") {
      expect(result.code).toBe("HASH_MISMATCH");
    } else {
      expect(result.status).toBe("valid");
    }
  });

  it("still verifies a legacy RenownCryptoSigner tuple", async () => {
    const { signer, target } = await buildDemoOperations();

    const result = await verifyOperation(
      await buildLegacyOperation(signer),
      target,
    );

    expect(result.scheme).toBe("legacy-renown");
    expect(result.status).toBe("valid");
  });

  it("encodes the preimage as sorted-key JSON", () => {
    expect(canonicalJson({ b: 1, a: [true, { d: null, c: undefined }] })).toBe(
      '{"a":[true,{"d":null}],"b":1}',
    );
  });
});
