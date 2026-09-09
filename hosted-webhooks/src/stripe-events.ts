import type { Action } from "document-model";
import { z } from "zod";
import {
  activate,
  cancel,
  markPastDue,
} from "document-models/subscription/v1";

/**
 * The part of a Stripe event this recipe reads. A real event carries far more,
 * and `data.object` differs per event type; these are the fields the three
 * mapped types share plus the ones each action needs.
 *
 * `id` is at the top level, which is what makes it usable as core's dedupe
 * field. `data.object.id` would not be: core reads the dedupe field from the
 * query string or a top-level body field, never from a nested one.
 */
const stripeEvent = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    object: z
      .object({
        customer: z.string().optional(),
        quantity: z.number().int().nonnegative().optional(),
        plan: z.object({ nickname: z.string().nullish() }).optional(),
        last_payment_error: z.object({ message: z.string() }).optional(),
      })
      .loose(),
  }),
});

export type StripeEvent = z.infer<typeof stripeEvent>;

/** The three event types this endpoint acts on. */
export const HANDLED_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

export type ParseResult =
  | { ok: true; event: StripeEvent }
  | { ok: false; reason: string };

/** Parses a delivery body core already decoded from the raw bytes. */
export function parseStripeEvent(body: unknown): ParseResult {
  const parsed = stripeEvent.safeParse(body);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  }
  return { ok: true, event: parsed.data };
}

/**
 * The action an event becomes, or null for an event type this endpoint does
 * not act on. Null is not an error: Stripe sends whatever the account is
 * subscribed to, and a 4xx for an event you chose not to handle makes Stripe
 * retry it and eventually disable the endpoint.
 */
export function actionForEvent(event: StripeEvent): Action | null {
  const object = event.data.object;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return activate({
        eventId: event.id,
        customerId: object.customer ?? "",
        plan: object.plan?.nickname ?? "unnamed",
        seats: object.quantity ?? 1,
      });
    case "invoice.payment_failed":
      return markPastDue({
        eventId: event.id,
        reason: object.last_payment_error?.message ?? "payment failed",
      });
    case "customer.subscription.deleted":
      return cancel({ eventId: event.id });
    default:
      return null;
  }
}
