import { pathToFileURL } from "node:url";
import {
  documentModelCreateDocument,
  setAuthorName,
  setModelDescription,
  setModelName,
} from "document-model";
import type {
  Action,
  ActionSigner,
  ISigner,
  Operation,
  Signature,
} from "document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";

export const APP_NAME = "demo-verifier-app";
export const USER = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  networkId: "eip155",
  chainId: 1,
};

/** The log an operation is stored in. A v2 tuple is bound to it. */
export type SigningTarget = { documentId: string; branch: string };

export type Scheme = "unsigned" | "v2" | "legacy-renown" | "legacy-unknown";

export type RefusalCode =
  | "MALFORMED_TUPLE"
  | "KEY_MISMATCH"
  | "HASH_MISMATCH"
  | "BAD_SIGNATURE";

type SignerIdentity = Omit<ActionSigner, "signatures">;

export type VerificationResult = {
  index: number;
  actionType: string;
  status: "valid" | "invalid" | "unsigned";
  scheme: Scheme;
  code?: RefusalCode;
  reason?: string;
  signer?: SignerIdentity;
  signatureTuple?: Signature;
};

const V2_PREFIX = "v2:";
const V2_HASH = /^v2:[A-Za-z0-9_-]{43}$/;
const V2_SIGNATURE = /^0x[0-9a-f]{128}$/;
const RENOWN_HASH_LENGTH = 44;
const HEX_SIGNATURE = /^(0x)?([0-9a-fA-F]{2})+$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// ── Signing ─────────────────────────────────────────────────────────────

export async function signFor(
  signer: ISigner,
  action: Action,
  target: SigningTarget,
): Promise<Signature> {
  return signer.signAction(action, target);
}

export async function createDemoSigner() {
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  const signer = new RenownCryptoSigner(renownCrypto, APP_NAME, USER);
  return { signer, renownCrypto };
}

function withSignature(
  action: Action,
  signer: ISigner,
  signature: Signature,
): Action {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: signer.user ?? { address: "", networkId: "", chainId: 0 },
        app: signer.app ?? { name: "", key: "" },
        signatures: [signature],
      },
    },
  };
}

function toOperation(action: Action, index: number): Operation {
  return {
    id: `op-${index}`,
    index,
    skip: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    action,
  };
}

// ── Core: build demo operations ─────────────────────────────────────────
export async function buildDemoOperations() {
  const { signer, renownCrypto } = await createDemoSigner();
  const document = documentModelCreateDocument();
  const target: SigningTarget = {
    documentId: document.header.id,
    branch: "main",
  };

  const actions: Action[] = [
    setModelName({ name: "InvoiceModel" }),
    setModelDescription({ description: "A model for tracking invoices" }),
    setAuthorName({ authorName: "Powerhouse DAO" }),
  ];

  const signedOperations: Operation[] = [];
  for (const [index, action] of actions.entries()) {
    const signature = await signFor(signer, action, target);
    signedOperations.push(
      toOperation(withSignature(action, signer, signature), index),
    );
  }

  return { signedOperations, document, target, signer, renownCrypto };
}

/** Legacy RenownCryptoSigner tuple: binds neither document nor signer. */
export async function signLegacyRenown(
  signer: ISigner,
  action: Action,
): Promise<Signature> {
  const params: [string, string, string, string] = [
    (Date.now() / 1000).toFixed(0),
    signer.app?.key ?? "",
    await legacyRenownHash(action),
    "",
  ];
  const signature = await signer.sign(signatureMessage(params));
  return [...params, `0x${bytesToHex(signature)}`];
}

export async function buildLegacyOperation(signer: ISigner): Promise<Operation> {
  const action = setModelName({ name: "LegacyModel" });
  const signature = await signLegacyRenown(signer, action);
  return toOperation(withSignature(action, signer, signature), 0);
}

// ── Core: inject bad data for testing ───────────────────────────────────
export function injectBadOperations(signedOperations: Operation[]): {
  allOperations: Operation[];
  tamperedIndex: number;
  editedIndex: number;
  unsignedIndex: number;
} {
  const allOperations = [...signedOperations];
  const copy = (op: Operation): Operation => ({
    ...(JSON.parse(JSON.stringify(op)) as Operation),
    index: allOperations.length,
  });

  // Tampered: the signature bytes are replaced
  const tampered = copy(signedOperations[0]);
  tampered.action.context!.signer!.signatures[0][4] = "0xDEADBEEF";
  const tamperedIndex = allOperations.length;
  allOperations.push(tampered);

  // Edited: the input changed after signing, the tuple is untouched
  const edited = copy(signedOperations[2]);
  edited.action.input = { authorName: "Mallory" };
  const editedIndex = allOperations.length;
  allOperations.push(edited);

  // Unsigned: the signer context is removed
  const unsigned = copy(signedOperations[1]);
  delete unsigned.action.context;
  const unsignedIndex = allOperations.length;
  allOperations.push(unsigned);

  return { allOperations, tamperedIndex, editedIndex, unsignedIndex };
}

// ── Core: verify ────────────────────────────────────────────────────────

/** The integrity checks a reactor runs on a mutation it stores. */
export async function verifyOperation(
  operation: Operation,
  target: SigningTarget,
): Promise<VerificationResult> {
  const { action } = operation;
  const base = { index: operation.index, actionType: action.type };
  const context = action.context?.signer;

  // An empty app key is what a client with no signer sends.
  if (!context?.app?.key) {
    return { ...base, status: "unsigned", scheme: "unsigned" };
  }

  const signer: SignerIdentity = { user: context.user, app: context.app };
  const tuple = context.signatures.at(-1);
  if (!tuple || tuple.length !== 5) {
    return refuse(
      { ...base, signer },
      "legacy-unknown",
      "MALFORMED_TUPLE",
      "no signature tuple",
    );
  }

  const result = { ...base, signer, signatureTuple: tuple };
  const scheme = schemeOf(tuple[2]);

  if (tuple[1] !== signer.app.key) {
    return refuse(
      result,
      scheme,
      "KEY_MISMATCH",
      "tuple key does not match signer.app.key",
    );
  }

  let expected: string;
  if (scheme === "v2") {
    if (!V2_HASH.test(tuple[2]) || !V2_SIGNATURE.test(tuple[4])) {
      return refuse(result, scheme, "MALFORMED_TUPLE", "not a v2 tuple shape");
    }
    try {
      expected = await hashActionV2(action, target, signer);
    } catch (error) {
      return refuse(result, scheme, "HASH_MISMATCH", errorMessage(error));
    }
  } else if (scheme === "legacy-renown") {
    expected = await legacyRenownHash(action);
  } else {
    return refuse(
      result,
      scheme,
      "MALFORMED_TUPLE",
      `hash of unknown length ${tuple[2].length}`,
    );
  }
  if (expected !== tuple[2]) {
    return refuse(
      result,
      scheme,
      "HASH_MISMATCH",
      "action does not match the hash its signature covers",
    );
  }

  if (!HEX_SIGNATURE.test(tuple[4])) {
    return refuse(result, scheme, "MALFORMED_TUPLE", "signature is not hex");
  }

  let publicKey: CryptoKey;
  try {
    publicKey = await importDidKey(tuple[1]);
  } catch (error) {
    return refuse(result, scheme, "MALFORMED_TUPLE", errorMessage(error));
  }

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      hexToBytes(tuple[4]),
      signatureMessage([tuple[0], tuple[1], tuple[2], tuple[3]]),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return refuse(
      result,
      scheme,
      "BAD_SIGNATURE",
      "signature does not verify under its key",
    );
  }

  return { ...result, status: "valid", scheme };
}

export async function verifyAllOperations(
  operations: Operation[],
  target: SigningTarget,
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const operation of operations) {
    results.push(await verifyOperation(operation, target));
  }
  return results;
}

function refuse(
  result: Omit<VerificationResult, "status" | "scheme">,
  scheme: Scheme,
  code: RefusalCode,
  reason: string,
): VerificationResult {
  return { ...result, status: "invalid", scheme, code, reason };
}

function schemeOf(hash: string): Scheme {
  if (hash.startsWith(V2_PREFIX)) return "v2";
  if (hash.length === RENOWN_HASH_LENGTH) return "legacy-renown";
  return "legacy-unknown";
}

// ── Hashes ──────────────────────────────────────────────────────────────

/** Sorted-key JSON. Object properties holding `undefined` are omitted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw new Error(`${typeof value} is not a JSON value`);
    }
    return json;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${members.join(",")}}`;
}

/** `"v2:" + base64url(sha256(canonicalJson(preimage)))`, unpadded. */
export async function hashActionV2(
  action: Action,
  target: SigningTarget,
  signer: SignerIdentity,
): Promise<string> {
  if (action.input === undefined) {
    throw new Error(`action ${action.id} has no input`);
  }
  const preimage = canonicalJson([
    "v2",
    target.documentId,
    target.branch,
    action.scope,
    action.type,
    action.id,
    action.timestampUtcMs,
    action.input,
    signer.user.address,
    signer.user.networkId,
    signer.user.chainId,
    signer.app.key,
  ]);
  const base64 = toBase64(await sha256(preimage));
  return (
    V2_PREFIX +
    base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}

async function legacyRenownHash(action: Action): Promise<string> {
  const payload = [
    action.scope,
    action.type,
    JSON.stringify(action.input),
  ].join("");
  return toBase64(await sha256(payload));
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return new Uint8Array(digest);
}

/** `\x19Signed Operation:\n{length}` followed by elements [0..3]. */
function signatureMessage(
  params: [string, string, string, string],
): Uint8Array<ArrayBuffer> {
  const message = params.join("");
  return new TextEncoder().encode(
    `\x19Signed Operation:\n${message.length}${message}`,
  );
}

// ── did:key ─────────────────────────────────────────────────────────────

/** A P-256 `did:key`: base58btc, multicodec 0x8024, compressed point. */
export async function importDidKey(did: string): Promise<CryptoKey> {
  const [scheme, method, multibase] = did.split(":");
  if (scheme !== "did" || method !== "key" || !multibase?.startsWith("z")) {
    throw new Error(`not a did:key: ${did}`);
  }
  const bytes = base58Decode(multibase.slice(1));
  if (bytes.length !== 35 || bytes[0] !== 0x80 || bytes[1] !== 0x24) {
    throw new Error("not a P-256 did:key");
  }
  return crypto.subtle.importKey(
    "raw",
    bytes.slice(2),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

function base58Decode(input: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const char of input) {
    let carry = BASE58.indexOf(char);
    if (carry < 0) {
      throw new Error(`invalid base58 character: ${char}`);
    }
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// ── Encoding ────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Reporting ───────────────────────────────────────────────────────────
function printReport(results: VerificationResult[]) {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         Signed Operations Verification Report          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const count = (status: VerificationResult["status"]) =>
    results.filter((r) => r.status === status).length;

  console.log(`  Total operations: ${results.length}`);
  console.log(`  Valid signatures: ${count("valid")}`);
  console.log(`  Invalid signatures: ${count("invalid")}`);
  console.log(`  Unsigned operations: ${count("unsigned")}\n`);

  console.log("── Per-operation results ──────────────────────────────────\n");

  for (const result of results) {
    const mark =
      result.status === "valid"
        ? "[PASS]"
        : result.status === "invalid"
          ? "[FAIL]"
          : "[NONE]";
    const refusal = result.code ? ` ${result.code}: ${result.reason}` : "";
    console.log(
      `  ${mark} Operation #${result.index} (${result.actionType}) ${result.scheme}${refusal}`,
    );

    if (result.signer) {
      console.log(`         User:  ${result.signer.user.address}`);
      console.log(
        `         Chain: ${result.signer.user.networkId}:${result.signer.user.chainId}`,
      );
      console.log(`         App:   ${result.signer.app.name}`);
    }

    if (result.signatureTuple) {
      const [timestamp, key, actionHash, prevStateHash, sig] =
        result.signatureTuple;
      console.log(`         Signature tuple:`);
      console.log(`           [0] timestamp:     ${timestamp}`);
      console.log(`           [1] signer key:    ${key.slice(0, 30)}...`);
      console.log(`           [2] actionHash:    ${actionHash}`);
      console.log(`           [3] prevStateHash: ${prevStateHash || "(empty)"}`);
      console.log(`           [4] signature:     ${sig.slice(0, 20)}...`);
    }

    console.log();
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log("Setting up RenownCryptoSigner...");
  const { signedOperations, target, signer } = await buildDemoOperations();
  console.log(
    `Signed ${signedOperations.length} operations for document ${target.documentId}`,
  );

  const { allOperations, tamperedIndex, editedIndex, unsignedIndex } =
    injectBadOperations(signedOperations);
  console.log(
    `Injected tampered (#${tamperedIndex}), edited (#${editedIndex}) and unsigned (#${unsignedIndex}) operations`,
  );

  printReport(await verifyAllOperations(allOperations, target));

  // A v2 tuple is bound to its document. A legacy tuple is not.
  const replayed = await verifyOperation(signedOperations[0], {
    documentId: "another-document",
    branch: "main",
  });
  console.log(
    `Operation #0 (${replayed.scheme}) checked against another document: ${replayed.status}${replayed.code ? ` (${replayed.code})` : ""}`,
  );

  const legacy = await verifyOperation(
    await buildLegacyOperation(signer),
    target,
  );
  console.log(`A legacy RenownCryptoSigner tuple: ${legacy.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
