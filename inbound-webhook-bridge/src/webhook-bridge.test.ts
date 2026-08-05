import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ReactorBuilder,
  JobAwaiter,
  type IReactor,
} from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createPaymentDocument,
  Payment,
  type PaymentDocument,
} from "document-models/payment/v1";
import {
  WebhookBridge,
  createWebhookServer,
  mapEventToAction,
  type HandleResult,
  type WebhookEvent,
} from "./webhook-bridge.js";
import { SIGNATURE_HEADER, signWebhook } from "./signature.js";

const SECRET = "whsec_test_secret";
const ORDER_ID = "order-42";

describe("mapEventToAction", () => {
  it("maps known provider event types to payment actions", () => {
    expect(
      mapEventToAction({ id: "e", type: "payment.succeeded", data: { orderId: "o", amountCents: 5 } }).type,
    ).toBe("RECORD_PAYMENT");
    expect(
      mapEventToAction({ id: "e", type: "payment.failed", data: { orderId: "o" } }).type,
    ).toBe("MARK_FAILED");
    expect(
      mapEventToAction({ id: "e", type: "refund.created", data: { orderId: "o", amountCents: 5 } }).type,
    ).toBe("RECORD_REFUND");
  });

  it("throws on an unknown event type", () => {
    expect(() =>
      mapEventToAction({ id: "e", type: "bogus" as never, data: { orderId: "o" } }),
    ).toThrow();
  });
});

describe("WebhookBridge over HTTP", () => {
  let reactor: IReactor;
  let bridge: WebhookBridge;
  let server: Server;
  let port: number;
  let documentId: string;

  beforeAll(async () => {
    const built = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
        Payment,
      ])
      .buildModule();
    reactor = built.reactor;

    const awaiter = new JobAwaiter(built.eventBus, (jobId, signal) =>
      reactor.getJobStatus(jobId, signal),
    );
    const doc = createPaymentDocument({
      global: { orderId: ORDER_ID, amountCents: 4200, currency: "usd" },
    });
    const job = await reactor.create(doc);
    await awaiter.waitForJob(job.id);
    awaiter.shutdown();
    documentId = doc.header.id;

    bridge = new WebhookBridge(reactor, built.eventBus, async (orderId) =>
      orderId === ORDER_ID ? documentId : null,
    );
    server = createWebhookServer({ secret: SECRET, bridge });
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;
  }, 60_000);

  afterAll(() => {
    bridge?.shutdown();
    server?.close();
    reactor?.kill();
  });

  const now = () => Math.floor(Date.now() / 1000);

  async function post(
    event: WebhookEvent,
    opts: { secret?: string; mutateBody?: (b: string) => string; ts?: number } = {},
  ): Promise<{ status: number; body: HandleResult & { error?: string } }> {
    const body = JSON.stringify(event);
    const signature = signWebhook(opts.secret ?? SECRET, body, opts.ts ?? now());
    const sent = opts.mutateBody ? opts.mutateBody(body) : body;
    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature },
      body: sent,
    });
    return { status: res.status, body: (await res.json()) as HandleResult & { error?: string } };
  }

  const succeeded: WebhookEvent = {
    id: "evt_success_1",
    type: "payment.succeeded",
    data: { orderId: ORDER_ID, amountCents: 4200 },
  };

  it("applies a valid event and advances the document to PAID", async () => {
    const { status, body } = await post(succeeded);
    expect(status).toBe(200);
    expect(body.status).toBe("applied");

    const doc = await reactor.get<PaymentDocument>(documentId);
    expect(doc.state.global.status).toBe("PAID");
  });

  it("rejects a tampered body with 400 before dispatching", async () => {
    const { status, body } = await post(succeeded, {
      mutateBody: (b) => b.replace("4200", "999999"),
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/signature mismatch/i);
  });

  it("ignores a duplicate event id (deduped against persisted state)", async () => {
    const { status, body } = await post(succeeded);
    expect(status).toBe(200);
    expect(body.status).toBe("duplicate");
  });

  it("rejects an event with a stale timestamp (replay window)", async () => {
    const { status, body } = await post(succeeded, { ts: now() - 3600 });
    expect(status).toBe(400);
    expect(body.error).toMatch(/tolerance window/i);
  });

  it("records exactly one state-changing operation across all deliveries", async () => {
    const ops = await reactor.getOperations(documentId);
    const domain = (ops.global?.results ?? []).filter((op) =>
      ["RECORD_PAYMENT", "MARK_FAILED", "RECORD_REFUND"].includes(op.action.type),
    );
    expect(domain).toHaveLength(1);
    expect(domain[0].action.type).toBe("RECORD_PAYMENT");
  });

  it("reports an unknown order without dispatching", async () => {
    const { status, body } = await post({
      id: "evt_unknown",
      type: "payment.succeeded",
      data: { orderId: "no-such-order", amountCents: 1 },
    });
    expect(status).toBe(200);
    expect(body.status).toBe("unknown-order");
  });
});
