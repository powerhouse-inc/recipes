import type { Action } from "document-model";
import { z } from "zod";
import {
  activate,
  cancel,
  markPastDue,
} from "document-models/subscription/v1";

/**
 * The envelope every Stripe event shares. `id` is the event id and is at the
 * top level, which is what core dedupes on. Core can also name a header or a
 * nested path, but neither is right here: `data.object.id` identifies the
 * subscription, not the delivery, so deduping on it would drop every event
 * after the first.
 */
const envelope = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.unknown() }),
});

/**
 * The part of a Stripe Subscription object this recipe reads
 * (docs.stripe.com/api/subscriptions/object). Plan and quantity are per item,
 * under `items.data[]`: the Subscription object has no top-level `plan` or
 * `quantity`. Fields Stripe documents as nullable are `.nullish()`.
 */
const subscriptionItem = z
  .object({
    quantity: z.number().int().nonnegative().nullish(),
    price: z
      .object({
        id: z.string(),
        nickname: z.string().nullish(),
        lookup_key: z.string().nullish(),
      })
      .loose()
      .nullish(),
    plan: z
      .object({ id: z.string(), nickname: z.string().nullish() })
      .loose()
      .nullish(),
  })
  .loose();

const subscriptionObject = z
  .object({
    object: z.literal("subscription"),
    customer: z.string().min(1),
    // A string rather than an enum: a status Stripe adds later is ignored,
    // not a 400.
    status: z.string().min(1),
    items: z.object({ data: z.array(subscriptionItem) }).loose(),
  })
  .loose();

/**
 * The part of a Stripe Invoice object this recipe reads
 * (docs.stripe.com/api/invoices/object). The Invoice carries no decline
 * message: that is on the PaymentIntent, reached through the invoice's
 * `payments` list, which is not included in the event and needs an API call
 * with the account's secret key. This recipe holds only the webhook signing
 * secret, so the reason is built from what the invoice does carry.
 */
const invoiceObject = z
  .object({
    object: z.literal("invoice"),
    customer: z.string().min(1),
    attempt_count: z.number().int().nonnegative().nullish(),
    next_payment_attempt: z.number().int().nullish(),
    last_finalization_error: z
      .object({ message: z.string().nullish() })
      .loose()
      .nullish(),
  })
  .loose();

export type StripeSubscription = z.infer<typeof subscriptionObject>;
export type StripeInvoice = z.infer<typeof invoiceObject>;

const SUBSCRIPTION_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

type SubscriptionEventType = (typeof SUBSCRIPTION_EVENTS)[number];

function isSubscriptionEvent(type: string): type is SubscriptionEventType {
  return (SUBSCRIPTION_EVENTS as readonly string[]).includes(type);
}

/** A delivery, with the object read for the event types this endpoint acts on. */
export type StripeEvent =
  | {
      kind: "subscription";
      id: string;
      type: SubscriptionEventType;
      subscription: StripeSubscription;
    }
  | {
      kind: "invoice.payment_failed";
      id: string;
      type: "invoice.payment_failed";
      invoice: StripeInvoice;
    }
  | { kind: "unhandled"; id: string; type: string };

export type ParseResult =
  | { ok: true; event: StripeEvent }
  | { ok: false; reason: string };

function failure(error: z.ZodError): ParseResult {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return {
    ok: false,
    reason: `${path ? `${path}: ` : ""}${issue?.message ?? "invalid"}`,
  };
}

/** Parses a delivery body core already decoded from the raw bytes. */
export function parseStripeEvent(body: unknown): ParseResult {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) return failure(parsed.error);
  const { id, type, data } = parsed.data;

  if (isSubscriptionEvent(type)) {
    const subscription = subscriptionObject.safeParse(data.object);
    if (!subscription.success) return failure(subscription.error);
    return {
      ok: true,
      event: { kind: "subscription", id, type, subscription: subscription.data },
    };
  }
  if (type === "invoice.payment_failed") {
    const invoice = invoiceObject.safeParse(data.object);
    if (!invoice.success) return failure(invoice.error);
    return {
      ok: true,
      event: { kind: "invoice.payment_failed", id, type, invoice: invoice.data },
    };
  }
  return { ok: true, event: { kind: "unhandled", id, type } };
}

/**
 * The Stripe customer an event is about, or undefined for an event this
 * endpoint does not read. Stripe sends every event on the account to every
 * endpoint registered on it, so this is how a delivery is matched to the one
 * customer a document follows.
 */
export function customerOf(event: StripeEvent): string | undefined {
  switch (event.kind) {
    case "subscription":
      return event.subscription.customer;
    case "invoice.payment_failed":
      return event.invoice.customer;
    case "unhandled":
      return undefined;
  }
}

/**
 * The action an event becomes, or null for an event this endpoint does not act
 * on. Null is not an error: Stripe sends whatever the account is subscribed
 * to, and a 4xx for an event you chose not to handle makes Stripe retry it and
 * eventually disable the endpoint.
 */
export function actionForEvent(event: StripeEvent): Action | null {
  switch (event.kind) {
    case "subscription":
      return event.type === "customer.subscription.deleted"
        ? cancel({ eventId: event.id })
        : actionForStatus(event.id, event.subscription);
    case "invoice.payment_failed":
      return markPastDue({
        eventId: event.id,
        reason: failureReason(event.invoice),
      });
    case "unhandled":
      return null;
  }
}

/**
 * A created or updated subscription, by the status Stripe reports on it. An
 * update is not an activation: Stripe sends `customer.subscription.updated`
 * when a subscription goes past due or unpaid, too.
 */
function actionForStatus(
  eventId: string,
  subscription: StripeSubscription,
): Action | null {
  switch (subscription.status) {
    case "active":
    case "trialing": {
      const item = subscription.items.data[0];
      return activate({
        eventId,
        customerId: subscription.customer,
        plan:
          item?.price?.nickname ??
          item?.price?.lookup_key ??
          item?.plan?.nickname ??
          item?.price?.id ??
          item?.plan?.id ??
          "unnamed",
        seats: item ? (item.quantity ?? 1) : 0,
      });
    }
    case "past_due":
    case "unpaid":
      return markPastDue({
        eventId,
        reason: `subscription is ${subscription.status}`,
      });
    case "canceled":
      return cancel({ eventId });
    default:
      // incomplete, incomplete_expired, paused: states this document does not
      // model. Acknowledged and left alone.
      return null;
  }
}

function failureReason(invoice: StripeInvoice): string {
  const finalization = invoice.last_finalization_error?.message;
  if (finalization) return `invoice could not be finalized: ${finalization}`;
  const attempt =
    invoice.attempt_count != null
      ? `payment attempt ${invoice.attempt_count} failed`
      : "payment failed";
  if (invoice.next_payment_attempt == null) {
    return `${attempt}, no retry scheduled`;
  }
  const next = new Date(invoice.next_payment_attempt * 1000).toISOString();
  return `${attempt}, next attempt ${next}`;
}
