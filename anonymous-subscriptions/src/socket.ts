import { createClient, type Client } from "graphql-ws";
import WebSocket from "ws";
import { DOCUMENT_TYPE, log } from "./config.js";

const DOCUMENT_CHANGES = `
  subscription Watch($search: SearchFilterInput!) {
    documentChanges(search: $search) {
      type
      documents { id name }
    }
  }
`;

export type Close = { code: number; reason: string };

export type Socket = {
  /** Names delivered by documentChanges, in arrival order. */
  received: string[];
  /** Every close the client saw, including the ones it retried through. */
  closes: Close[];
  /** Errors the subscription itself reported, as opposed to socket closes. */
  errors: string[];
  connects: number;
  /** Set when the client gave up, which is what a fatal close code produces. */
  abandoned?: Close | string;
  stop: () => void;
};

export type SocketOptions = {
  label: string;
  url: string;
  /** Called per connect attempt, so a later attempt can carry a bearer. */
  connectionParams: () => Record<string, unknown>;
  retryAttempts?: number;
};

/** Subscribes and records what the client observes, never throwing. */
export function watch(options: SocketOptions): Socket {
  const socket: Socket = {
    received: [],
    closes: [],
    errors: [],
    connects: 0,
    stop: () => undefined,
  };

  const client: Client = createClient({
    url: options.url,
    webSocketImpl: WebSocket,
    lazy: false,
    // Default is console.error, which dumps the whole CloseEvent.
    onNonLazyError: () => undefined,
    retryAttempts: options.retryAttempts ?? 10,
    retryWait: () => new Promise((resolve) => setTimeout(resolve, 250)),
    connectionParams: options.connectionParams,
    on: {
      connected: () => {
        socket.connects += 1;
        log(`  ${options.label}: connected (ack received)`);
      },
      closed: (event) => {
        const close = event as Close;
        socket.closes.push({ code: close.code, reason: close.reason });
        log(
          `  ${options.label}: socket closed ${close.code} ${close.reason || ""}`.trimEnd(),
        );
      },
    },
  });

  const dispose = client.subscribe(
    {
      query: DOCUMENT_CHANGES,
      variables: { search: { type: DOCUMENT_TYPE } },
    },
    {
      next: (message) => {
        for (const error of message.errors ?? []) {
          socket.errors.push(error.message);
          log(`  ${options.label}: subscription error ${error.message}`);
        }
        const event = (
          message.data as {
            documentChanges?: { documents: Array<{ name: string }> };
          } | null
        )?.documentChanges;
        for (const document of event?.documents ?? []) {
          socket.received.push(document.name);
          log(`  ${options.label}: received "${document.name}"`);
        }
      },
      error: (error) => {
        const close = error as Partial<Close>;
        socket.abandoned =
          typeof close.code === "number"
            ? { code: close.code, reason: close.reason ?? "" }
            : JSON.stringify(error);
        log(`  ${options.label}: gave up: ${JSON.stringify(socket.abandoned)}`);
      },
      complete: () => undefined,
    },
  );

  socket.stop = () => {
    dispose();
    void client.dispose();
  };

  return socket;
}
