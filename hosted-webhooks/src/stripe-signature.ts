/**
 * The provider's side of the handshake, for the demo and the tests. Nothing
 * here runs in the package: core verifies the signature before this recipe's
 * code sees a delivery.
 */
import { createHmac } from "node:crypto";

/**
 * The `Stripe-Signature` header, computed over the exact bytes of the payload.
 * Re-serializing the body before signing, or before verifying, breaks it —
 * which is why core hands the handler the octets it received rather than a
 * parsed object it re-encoded.
 */
export function stripeSignature(
  secret: string,
  raw: string,
  timestampSeconds: number,
): string {
  const signature = createHmac("sha256", secret)
    .update(
      Buffer.concat([Buffer.from(`${timestampSeconds}.`), Buffer.from(raw)]),
    )
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}
