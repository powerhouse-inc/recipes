import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC webhook signatures, modelled on Stripe's `Stripe-Signature` scheme.
 *
 * The signed payload is `${timestamp}.${rawBody}` — the timestamp is folded
 * into the MAC so it can't be tampered with independently, which is what makes
 * the replay-window check trustworthy.
 *
 * THE non-negotiable rule: the signature is computed over the EXACT request
 * bytes. `JSON.parse(body)` followed by `JSON.stringify(parsed)` produces
 * different bytes (key order, whitespace, number formatting) and silently
 * breaks verification. Always verify the raw body, then parse.
 */

export const SIGNATURE_HEADER = "x-webhook-signature";

/** Default replay tolerance: reject events whose timestamp is >5 min off. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Builds a `t=<unixSeconds>,v1=<hmacHex>` header for the given raw body. */
export function signWebhook(
  secret: string,
  rawBody: string,
  timestampSeconds: number,
): string {
  const v1 = hmac(secret, `${timestampSeconds}.${rawBody}`);
  return `t=${timestampSeconds},v1=${v1}`;
}

export type VerifyResult =
  | { ok: true; timestampSeconds: number }
  | { ok: false; reason: string };

export function verifyWebhook(opts: {
  secret: string;
  /** The raw request bytes, decoded as utf8 — never re-serialized JSON. */
  rawBody: string;
  signatureHeader: string | string[] | undefined;
  nowSeconds: number;
  toleranceSeconds?: number;
}): VerifyResult {
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  const header = Array.isArray(opts.signatureHeader)
    ? opts.signatureHeader[0]
    : opts.signatureHeader;
  if (!header) {
    return { ok: false, reason: "missing signature header" };
  }

  const parsed = parseHeader(header);
  if (!parsed) {
    return { ok: false, reason: "malformed signature header" };
  }
  const { timestampSeconds, signature } = parsed;

  // 1. Recompute the MAC over the raw bytes and compare in constant time.
  const expected = hmac(opts.secret, `${timestampSeconds}.${opts.rawBody}`);
  if (!constantTimeEqualHex(signature, expected)) {
    return { ok: false, reason: "signature mismatch" };
  }

  // 2. Reject stale (or future-dated) events — replay protection.
  if (Math.abs(opts.nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: "timestamp outside tolerance window" };
  }

  return { ok: true, timestampSeconds };
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function parseHeader(
  header: string,
): { timestampSeconds: number; signature: string } | null {
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") t = Number(value);
    else if (key === "v1") v1 = value;
  }
  if (t === undefined || Number.isNaN(t) || !v1) {
    return null;
  }
  return { timestampSeconds: t, signature: v1 };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  // timingSafeEqual throws on length mismatch, so guard first — a length
  // difference is itself a mismatch.
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
