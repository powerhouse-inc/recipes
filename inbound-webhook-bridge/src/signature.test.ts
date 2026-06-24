import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE_SECONDS,
  signWebhook,
  verifyWebhook,
} from "./signature.js";

const SECRET = "whsec_test";
const NOW = 1_700_000_000;
const RAW = '{"id":"evt_1","type":"payment.succeeded","data":{"orderId":"o1"}}';

function verify(rawBody: string, header: string | undefined, now = NOW) {
  return verifyWebhook({
    secret: SECRET,
    rawBody,
    signatureHeader: header,
    nowSeconds: now,
  });
}

describe("webhook signature verification", () => {
  it("accepts a signature computed over the exact raw bytes", () => {
    const sig = signWebhook(SECRET, RAW, NOW);
    expect(verify(RAW, sig)).toEqual({ ok: true, timestampSeconds: NOW });
  });

  it("rejects a tampered body (the headline footgun)", () => {
    const sig = signWebhook(SECRET, RAW, NOW);
    const tampered = RAW.replace("o1", "o2");
    expect(verify(tampered, sig)).toEqual({
      ok: false,
      reason: "signature mismatch",
    });
  });

  it("rejects re-stringified JSON even when semantically identical", () => {
    // A provider sends bytes with its own spacing; the MAC covers those bytes.
    const rawWithSpacing = '{ "id": "evt_1", "type": "payment.succeeded" }';
    const sig = signWebhook(SECRET, rawWithSpacing, NOW);

    // Parsing then re-serializing produces different bytes -> different MAC.
    const reStringified = JSON.stringify(JSON.parse(rawWithSpacing));
    expect(reStringified).not.toBe(rawWithSpacing);
    expect(verify(reStringified, sig)).toEqual({
      ok: false,
      reason: "signature mismatch",
    });

    // ...whereas verifying the original raw bytes succeeds.
    expect(verify(rawWithSpacing, sig)).toEqual({ ok: true, timestampSeconds: NOW });
  });

  it("rejects a signature made with the wrong secret", () => {
    const sig = signWebhook("wrong_secret", RAW, NOW);
    expect(verify(RAW, sig)).toEqual({
      ok: false,
      reason: "signature mismatch",
    });
  });

  it("rejects a missing or malformed header", () => {
    expect(verify(RAW, undefined)).toEqual({
      ok: false,
      reason: "missing signature header",
    });
    expect(verify(RAW, "garbage")).toEqual({
      ok: false,
      reason: "malformed signature header",
    });
  });

  it("rejects an expired timestamp (replay protection)", () => {
    const sig = signWebhook(SECRET, RAW, NOW);
    const later = NOW + DEFAULT_TOLERANCE_SECONDS + 1;
    expect(verify(RAW, sig, later)).toEqual({
      ok: false,
      reason: "timestamp outside tolerance window",
    });
  });

  it("accepts a timestamp at the edge of the tolerance window", () => {
    const sig = signWebhook(SECRET, RAW, NOW);
    const edge = NOW + DEFAULT_TOLERANCE_SECONDS;
    expect(verify(RAW, sig, edge)).toEqual({
      ok: true,
      timestampSeconds: NOW,
    });
  });
});
