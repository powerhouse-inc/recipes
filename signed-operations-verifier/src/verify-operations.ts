import {
  ab2hex,
  actionSigner,
  buildSignedAction,
  hex2ab,
  verifyOperationSignature,
} from "document-model/core";
import {
  documentModelCreateDocument,
  documentModelReducer,
  setModelName,
  setModelDescription,
  setAuthorName,
} from "document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  createSignatureVerifier,
} from "@renown/sdk/node";
import type {
  Action,
  ActionSigner,
  ISigner,
  Operation,
  Signature,
} from "document-model";

// ── ECDSA verification handler ──────────────────────────────────────────
// This is the ActionVerificationHandler that verifyOperationSignature()
// needs: (publicKey: string, signature: Uint8Array, data: Uint8Array) => Promise<boolean>
//
// It imports the raw public key hex from the signature tuple, then
// verifies using Web Crypto's ECDSA P-256 / SHA-256 — the same curve
// that RenownCryptoSigner uses internally.
const ecdsaVerificationHandler = async (
  publicKey: string,
  signature: Uint8Array,
  data: Uint8Array,
): Promise<boolean> => {
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const rawKey = hex2ab(publicKey);
  const importedKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
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

// ── Report types ────────────────────────────────────────────────────────
type VerificationResult = {
  index: number;
  actionType: string;
  status: "valid" | "invalid" | "unsigned";
  signer?: {
    user: { address: string; networkId: string; chainId: number };
    app: { name: string; key: string };
  };
  signatureTuple?: Signature;
};

// ── Core: build demo operations ─────────────────────────────────────────
export async function buildDemoOperations() {
  // 1. Set up RenownCryptoSigner (ISigner implementation)
  //    MemoryKeyStorage generates a fresh ECDSA P-256 key pair in memory.
  //    No filesystem, no network — perfect for demos.
  const keyStorage = new MemoryKeyStorage();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();
  const signer: ISigner = new RenownCryptoSigner(
    renownCrypto,
    "demo-verifier-app",
  );

  // 2. Export the public key as a hex string for the ActionSigner
  const publicKeyRaw = await crypto.subtle.exportKey("raw", signer.publicKey);
  const publicKeyHex = `0x${ab2hex(publicKeyRaw)}`;

  // 3. Construct the ActionSigner identity (user + app + signatures[])
  const signerIdentity: ActionSigner = actionSigner(
    { address: "eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chainId: 1, networkId: "eip155" },
    { name: "demo-verifier-app", key: publicKeyHex },
  );

  // 4. Create a document using the built-in DocumentModel type
  let document = documentModelCreateDocument();

  // 5. Build signed operations for several actions
  const actions: Action[] = [
    setModelName({ name: "InvoiceModel" }),
    setModelDescription({ description: "A model for tracking invoices" }),
    setAuthorName({ authorName: "Powerhouse DAO" }),
  ];

  const signedOperations: Operation[] = [];
  const signHandler = signer.sign.bind(signer);

  for (const action of actions) {
    const operation = await buildSignedAction(
      action,
      documentModelReducer,
      document,
      signerIdentity,
      signHandler,
    );
    signedOperations.push(operation);
    // Advance the document state so the next operation gets the correct
    // previous state hash in its signature tuple.
    document = documentModelReducer(document, action);
  }

  return { signedOperations, document, publicKeyHex, signerIdentity, signer, renownCrypto };
}

// ── Core: inject bad data for testing ───────────────────────────────────
export function injectBadOperations(signedOperations: Operation[]): {
  allOperations: Operation[];
  tamperedIndex: number;
  unsignedIndex: number;
} {
  const allOperations = [...signedOperations];

  // Tampered: copy a valid operation and corrupt the signature bytes
  const tampered: Operation = JSON.parse(JSON.stringify(signedOperations[0]));
  tampered.index = allOperations.length;
  tampered.action.context!.signer!.signatures[0][4] = "0xDEADBEEF";
  const tamperedIndex = allOperations.length;
  allOperations.push(tampered);

  // Unsigned: copy a valid operation and remove the signer context entirely
  const unsigned: Operation = JSON.parse(JSON.stringify(signedOperations[1]));
  unsigned.index = allOperations.length;
  delete unsigned.action.context;
  const unsignedIndex = allOperations.length;
  allOperations.push(unsigned);

  return { allOperations, tamperedIndex, unsignedIndex };
}

// ── Core: verify all operations ─────────────────────────────────────────
export async function verifyAllOperations(
  operations: Operation[],
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const op of operations) {
    const signerContext = op.action.context?.signer;

    // No signer → unsigned
    if (!signerContext || !signerContext.signatures?.length) {
      results.push({
        index: op.index,
        actionType: op.action.type,
        status: "unsigned",
      });
      continue;
    }

    // Verify each signature in the tuple array
    for (const signature of signerContext.signatures) {
      const valid = await verifyOperationSignature(
        signature,
        signerContext,
        ecdsaVerificationHandler,
      );

      results.push({
        index: op.index,
        actionType: op.action.type,
        status: valid ? "valid" : "invalid",
        signer: {
          user: signerContext.user,
          app: signerContext.app,
        },
        signatureTuple: signature,
      });
    }
  }

  return results;
}

// ── Alternative flow: RenownCryptoSigner.signAction() + createSignatureVerifier()
// buildSignedAction() stores the raw hex public key in signature[1].
// RenownCryptoSigner.signAction() stores the DID (did:key:z...) in signature[1].
// createSignatureVerifier() expects the DID format, so it pairs with signAction().
// This function demonstrates that higher-level signing/verification path.
export async function buildAndVerifyWithSignAction() {
  const keyStorage = new MemoryKeyStorage();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();
  const signer = new RenownCryptoSigner(renownCrypto, "demo-verifier-app");

  // Sign an action directly using the ISigner.signAction() method.
  // This produces a Signature tuple with the DID as signature[1].
  const action = setModelName({ name: "TestModel" });
  const signatureTuple = await signer.signAction(action);

  // Build a mock operation carrying this signature
  const operation: Operation = {
    id: "demo-op",
    index: 0,
    skip: 0,
    timestampUtcMs: String(Date.now()),
    hash: "",
    action: {
      ...action,
      context: {
        signer: {
          user: { address: "eip155:1:0xABCD", chainId: 1, networkId: "eip155" },
          app: { name: "demo-verifier-app", key: renownCrypto.did },
          signatures: [signatureTuple],
        },
      },
    },
  };

  // Verify using the SDK's higher-level verifier
  const sdkVerifier = createSignatureVerifier();
  const valid = await sdkVerifier(operation, renownCrypto.did);

  return { valid, signatureTuple, did: renownCrypto.did };
}

// ── Reporting ───────────────────────────────────────────────────────────
function printReport(results: VerificationResult[]) {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         Signed Operations Verification Report          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const valid = results.filter((r) => r.status === "valid");
  const invalid = results.filter((r) => r.status === "invalid");
  const unsigned = results.filter((r) => r.status === "unsigned");

  console.log(`  Total operations: ${results.length}`);
  console.log(`  Valid signatures: ${valid.length}`);
  console.log(`  Invalid signatures: ${invalid.length}`);
  console.log(`  Unsigned operations: ${unsigned.length}\n`);

  console.log("── Per-operation results ──────────────────────────────────\n");

  for (const result of results) {
    const statusIcon =
      result.status === "valid"
        ? "[PASS]"
        : result.status === "invalid"
          ? "[FAIL]"
          : "[NONE]";

    console.log(`  ${statusIcon} Operation #${result.index} (${result.actionType})`);

    if (result.signer) {
      console.log(`         User:  ${result.signer.user.address}`);
      console.log(
        `         Chain: ${result.signer.user.networkId}:${result.signer.user.chainId}`,
      );
      console.log(`         App:   ${result.signer.app.name}`);
    }

    if (result.signatureTuple) {
      // Signature tuple structure: [timestamp, publicKey, actionHash, prevStateHash, signature]
      const [timestamp, pubKey, actionHash, prevStateHash, sig] =
        result.signatureTuple;
      console.log(`         Signature tuple:`);
      console.log(`           [0] timestamp:     ${timestamp}`);
      console.log(`           [1] publicKey:     ${pubKey.slice(0, 20)}...`);
      console.log(`           [2] actionHash:    ${actionHash}`);
      console.log(`           [3] prevStateHash: ${prevStateHash || "(empty)"}`);
      console.log(
        `           [4] signature:     ${sig.slice(0, 20)}...`,
      );
    }

    console.log();
  }

  // Signer identity chain summary
  const signers = new Map<string, VerificationResult["signer"]>();
  for (const r of results) {
    if (r.signer) {
      signers.set(r.signer.app.key, r.signer);
    }
  }

  if (signers.size > 0) {
    console.log("── Signer identity chain ─────────────────────────────────\n");
    for (const [key, signer] of signers) {
      console.log(`  App: ${signer!.app.name}`);
      console.log(`    Public key: ${key.slice(0, 30)}...`);
      console.log(`    User address: ${signer!.user.address}`);
      console.log(
        `    Network: ${signer!.user.networkId} (chain ${signer!.user.chainId})`,
      );
      console.log();
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log("Setting up RenownCryptoSigner...");
  const { signedOperations, document } = await buildDemoOperations();
  console.log(
    `Built ${signedOperations.length} signed operations on document "${document.state.global.name || "(unnamed)"}"`,
  );

  // Inject tampered + unsigned operations for detection demo
  const { allOperations, tamperedIndex, unsignedIndex } =
    injectBadOperations(signedOperations);
  console.log(
    `Injected tampered (index ${tamperedIndex}) and unsigned (index ${unsignedIndex}) operations`,
  );

  // Verify every operation using verifyOperationSignature()
  const results = await verifyAllOperations(allOperations);

  // Also demonstrate the alternative flow: RenownCryptoSigner.signAction()
  // paired with createSignatureVerifier() from @renown/sdk.
  // This is a higher-level path where the DID is used as the public key
  // identifier (vs raw hex in the buildSignedAction path above).
  const sdkResult = await buildAndVerifyWithSignAction();
  console.log(
    `\n  createSignatureVerifier() + signAction() check: ${sdkResult.valid ? "valid" : "invalid"}`,
  );

  printReport(results);
}

main().catch(console.error);
