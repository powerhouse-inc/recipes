/**
 * The callers the demo sends: each one a real did:key-signed Renown bearer
 * for an address, the credential `verifyBearer` reads before the gate runs.
 */
import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk/node";
import { createClient } from "graphql-ws";
import { WebSocket } from "ws";

export const ADMIN = "0xa11ce00000000000000000000000000000000001";
export const HOLDER = "0xb0b0000000000000000000000000000000000002";
export const STRANGER = "0xc0ffee0000000000000000000000000000000003";
/** A caller whose licence starts while Vetra is unreachable. */
export const NEWCOMER = "0xd00d000000000000000000000000000000000004";

/** The gate token Vetra issues the instance (`vgt_` + 64 hex). */
export const GATE_TOKEN = "vgt_" + "5e".repeat(32);

let crypto: Awaited<ReturnType<RenownCryptoBuilder["build"]>> | undefined;

export async function bearerFor(address: string): Promise<string> {
  crypto ??= await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return crypto.getBearerToken(address);
}

export interface Answer {
  status: number;
  body: string;
}

/** POSTs `{ __typename }` to `/graphql`, as `address` or anonymously. */
export async function graphql(
  origin: string,
  address?: string,
): Promise<Answer> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (address) headers.authorization = `Bearer ${await bearerFor(address)}`;
  const response = await fetch(`${origin}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "{ __typename }" }),
  });
  return { status: response.status, body: await response.text() };
}

/** GETs a path with no credentials. */
export async function get(origin: string, path: string): Promise<number> {
  const response = await fetch(`${origin}${path}`);
  await response.text();
  return response.status;
}

export type SocketOutcome =
  | { kind: "connected"; close(): Promise<void>; closed: Promise<CloseInfo> }
  | { kind: "refused"; code: number; reason: string };

export interface CloseInfo {
  code: number;
  reason: string;
}

/**
 * Opens a GraphQL WebSocket as `address`. Resolves `connected` on
 * `connection_ack`, or `refused` with the close the server sent instead.
 * A connected socket's `closed` resolves when the server closes it later.
 */
export async function openSocket(
  port: number,
  address: string,
): Promise<SocketOutcome> {
  const authorization = `Bearer ${await bearerFor(address)}`;
  let settle: (outcome: SocketOutcome) => void = () => {};
  let onLaterClose: (info: CloseInfo) => void = () => {};
  const closed = new Promise<CloseInfo>((resolve) => (onLaterClose = resolve));
  let acked = false;

  const client = createClient({
    url: `ws://127.0.0.1:${port}/graphql/subscriptions`,
    webSocketImpl: WebSocket,
    connectionParams: { authorization },
    retryAttempts: 0,
    lazy: false,
    on: {
      connected: () => {
        acked = true;
        settle({
          kind: "connected",
          close: async () => {
            await client.dispose();
          },
          closed,
        });
      },
      closed: (event) => {
        const { code, reason } = event as { code: number; reason: string };
        if (acked) onLaterClose({ code, reason });
        else settle({ kind: "refused", code, reason });
      },
    },
    onNonLazyError: () => {},
  });

  return new Promise<SocketOutcome>((resolve) => (settle = resolve));
}
