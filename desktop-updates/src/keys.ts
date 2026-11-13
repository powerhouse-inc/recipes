import { generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * An update signing key pair in the shape `tauri signer generate` writes:
 * minisign keys, each file's text base64-encoded once more. app.json takes
 * the public one; the private one is TAURI_SIGNING_PRIVATE_KEY at build time.
 *
 * Only the public key is real here. Tauri's private key file is encrypted
 * with a password, which this recipe has no use for: `secretKeyLookalike`
 * has the private file's first line, which is what the app.json schema
 * looks at when it refuses a private key pasted in the wrong place.
 */
export interface ReleaseKeys {
  /** For app.json `updates.pubkey`. */
  pubkey: string;
  /** Looks like TAURI_SIGNING_PRIVATE_KEY, signs nothing. */
  secretKeyLookalike: string;
}

const b64 = (text: string) => Buffer.from(text).toString("base64");

export function releaseKeys(): ReleaseKeys {
  const { publicKey } = generateKeyPairSync("ed25519");
  // The raw 32 bytes are the last 32 of the DER encoding.
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const keyId = randomBytes(8);
  const keyIdHex = Buffer.from(keyId).reverse().toString("hex").toUpperCase();
  // minisign: "Ed", the key id (little-endian), the key.
  const body = Buffer.concat([Buffer.from("Ed"), keyId, raw]).toString(
    "base64",
  );
  return {
    pubkey: b64(
      `untrusted comment: minisign public key: ${keyIdHex}\n${body}\n`,
    ),
    secretKeyLookalike: b64(
      `untrusted comment: rsign encrypted secret key\n${randomBytes(64).toString("base64")}\n`,
    ),
  };
}
