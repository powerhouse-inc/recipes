import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Action } from "document-model";
import { JobAwaiter, JobStatus, type IEventBus, type IReactor } from "@powerhousedao/reactor";
import type { PaymentDocument } from "./payment-model.js";
import { markFailed, recordPayment, recordRefund } from "./payment-model.js";
import {
  DEFAULT_TOLERANCE_SECONDS,
  SIGNATURE_HEADER,
  verifyWebhook,
} from "./signature.js";

/**
 * The external provider's event shape. Real providers (Stripe, Alchemy) carry
 * far more; this is the minimum the bridge needs to route and dispatch.
 */
export type WebhookEvent = {
  /** Stable provider event id — the dedup key. */
  id: string;
  type: "payment.succeeded" | "payment.failed" | "refund.created";
  data: {
    orderId: string;
    amountCents?: number;
    reason?: string;
  };
};

export type HandleResult =
  | { status: "applied"; action: string; documentId: string }
  | { status: "duplicate"; documentId: string }
  | { status: "rejected"; reason: string }
  | { status: "unknown-order"; orderId: string }
  | { status: "unknown-event-type"; type: string };

/** Resolves a provider order id to the reactor document id that tracks it. */
export type DocumentResolver = (orderId: string) => Promise<string | null>;

/**
 * Maps a verified webhook event onto a typed payment action. Throws on an
 * unrecognized event type so the caller can answer the provider explicitly.
 */
export function mapEventToAction(event: WebhookEvent): Action {
  switch (event.type) {
    case "payment.succeeded":
      return recordPayment({
        eventId: event.id,
        amountCents: event.data.amountCents ?? 0,
      });
    case "payment.failed":
      return markFailed({
        eventId: event.id,
        reason: event.data.reason ?? "unknown",
      });
    case "refund.created":
      return recordRefund({
        eventId: event.id,
        amountCents: event.data.amountCents ?? 0,
      });
    default:
      throw new Error(`unknown event type: ${(event as WebhookEvent).type}`);
  }
}

/**
 * Turns verified webhook events into document actions and dispatches them.
 *
 * Signature verification is intentionally NOT done here — it happens at the
 * HTTP edge against the raw bytes (see {@link createWebhookServer}). By the
 * time an event reaches the bridge it is already trusted.
 */
export class WebhookBridge {
  private readonly awaiter: JobAwaiter;

  constructor(
    private readonly reactor: IReactor,
    eventBus: IEventBus,
    private readonly resolveDocumentId: DocumentResolver,
    private readonly branch = "main",
  ) {
    this.awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
  }

  async handleEvent(event: WebhookEvent): Promise<HandleResult> {
    const documentId = await this.resolveDocumentId(event.data.orderId);
    if (!documentId) {
      return { status: "unknown-order", orderId: event.data.orderId };
    }

    let action: Action;
    try {
      action = mapEventToAction(event);
    } catch {
      return { status: "unknown-event-type", type: event.type };
    }

    // Idempotency: dedup against the document's PERSISTED processed-event set,
    // so a redelivery is ignored even across reactor restarts. The reducer
    // enforces this too, but short-circuiting here keeps history clean — the
    // duplicate never becomes an operation at all.
    const doc = await this.reactor.get<PaymentDocument>(documentId);
    if (doc.state.global.processedEventIds.includes(event.id)) {
      return { status: "duplicate", documentId };
    }

    const job = await this.reactor.execute(documentId, this.branch, [action]);
    try {
      const info = await this.awaiter.waitForJob(job.id);
      if (info.status === JobStatus.FAILED) {
        return { status: "rejected", reason: info.error?.message ?? "job failed" };
      }
    } catch (err) {
      return {
        status: "rejected",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    return { status: "applied", action: action.type, documentId };
  }

  shutdown(): void {
    this.awaiter.shutdown();
  }
}

/**
 * A standalone HTTP listener that verifies signatures against the raw request
 * bytes before doing anything else, then hands verified events to the bridge.
 *
 * Why a raw `node:http` server rather than a GraphQL mutation resolver? HMAC
 * verification needs the exact bytes the provider signed. A GraphQL/JSON entry
 * point parses the body before your code sees it, so the bytes you'd re-encode
 * to verify are no longer guaranteed to match. The brief calls this out: when
 * raw-body access is awkward, prefer a small listener that controls the bytes.
 */
export function createWebhookServer(opts: {
  secret: string;
  bridge: WebhookBridge;
  toleranceSeconds?: number;
  /** Injectable clock (seconds) — keeps the replay-window check testable. */
  now?: () => number;
}): Server {
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      // The exact bytes as received — never round-tripped through JSON.
      const rawBody = Buffer.concat(chunks).toString("utf8");

      const verdict = verifyWebhook({
        secret: opts.secret,
        rawBody,
        signatureHeader: req.headers[SIGNATURE_HEADER],
        nowSeconds: now(),
        toleranceSeconds: tolerance,
      });
      if (!verdict.ok) {
        return json(res, 400, { error: verdict.reason });
      }

      let event: WebhookEvent;
      try {
        event = JSON.parse(rawBody) as WebhookEvent;
      } catch {
        return json(res, 400, { error: "invalid JSON body" });
      }

      // NOTE: this demo dispatches synchronously and waits for the job so the
      // HTTP response carries the outcome — clearer to read. A production
      // endpoint should ack 2xx immediately and process asynchronously so a
      // slow reducer can't trip the provider's delivery timeout.
      opts.bridge
        .handleEvent(event)
        .then((result) => {
          const code = result.status === "rejected" ? 422 : 200;
          json(res, code, result);
        })
        .catch((err: unknown) => {
          json(res, 500, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    });
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
