/**
 * A stand-in for Vetra's licence gate, speaking the contract a switchboard
 * run with `ACCESS=licensed` calls:
 *
 *   POST <VETRA_GATE_URL>
 *   Authorization: Bearer <VETRA_GATE_TOKEN>
 *   { "address": "0x<40 hex, lower case>" }
 *
 *   200 { allowed, reason, until, ttlSeconds }
 *   401 the token is unknown or revoked
 *   5xx Vetra is unavailable
 *
 * The real gate decides from the plan's licences. This one decides from a set
 * the demo edits, and can be switched into an outage.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface GateCall {
  address: string;
  authorization: string | undefined;
  appId: string | undefined;
}

export interface FakeVetra {
  /** The URL to pass as `VETRA_GATE_URL`. */
  url: string;
  /** Every request the gate received, in order. */
  calls: GateCall[];
  /** Gives `address` a live licence. */
  grant(address: string): void;
  /** Ends `address`'s licence; the host notices once its cached answer expires. */
  revoke(address: string): void;
  /** While true, every request answers 503. */
  setDown(down: boolean): void;
  /** Revokes the instance's token: from now on only `token` is accepted. */
  rotateToken(token: string): void;
  close(): Promise<void>;
}

export async function startFakeVetra(options: {
  /** The gate token this instance accepts; anything else answers 401. */
  token: string;
  /** How long the host may cache each answer, in seconds (1 to 300). */
  ttlSeconds: number;
}): Promise<FakeVetra> {
  const licences = new Set<string>();
  const calls: GateCall[] = [];
  let down = false;
  let token = options.token;

  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const address = (JSON.parse(body || "{}") as { address?: string })
        .address;
      calls.push({
        address: address ?? "",
        authorization: req.headers.authorization,
        appId: req.headers["x-vetra-app-id"] as string | undefined,
      });
      res.setHeader("content-type", "application/json");

      if (down) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "UNAVAILABLE" }));
        return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "UNAUTHENTICATED" }));
        return;
      }
      if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "BAD_ADDRESS" }));
        return;
      }

      const allowed = licences.has(address);
      res.end(
        JSON.stringify({
          allowed,
          reason: allowed ? "licence" : "none",
          until: null,
          ttlSeconds: options.ttlSeconds,
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/@powerhousedao/vetra-cloud-package/apps/gate/check`,
    calls,
    grant: (address) => licences.add(address.toLowerCase()),
    revoke: (address) => licences.delete(address.toLowerCase()),
    setDown: (value) => {
      down = value;
    },
    rotateToken: (value) => {
      token = value;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
