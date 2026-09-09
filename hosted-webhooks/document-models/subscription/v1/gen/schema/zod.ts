/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  ActivateInput,
  CancelInput,
  MarkPastDueInput,
  SubscriptionState,
  SubscriptionStatus,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const SubscriptionStatusSchema = z.enum([
  "ACTIVE",
  "CANCELED",
  "PAST_DUE",
  "PENDING",
]);

export function ActivateInputSchema(): z.ZodObject<Properties<ActivateInput>> {
  return z.object({
    customerId: z.string(),
    eventId: z.string(),
    plan: z.string(),
    seats: z.number(),
  });
}

export function CancelInputSchema(): z.ZodObject<Properties<CancelInput>> {
  return z.object({
    eventId: z.string(),
  });
}

export function MarkPastDueInputSchema(): z.ZodObject<
  Properties<MarkPastDueInput>
> {
  return z.object({
    eventId: z.string(),
    reason: z.string(),
  });
}

export function SubscriptionStateSchema(): z.ZodObject<
  Properties<SubscriptionState>
> {
  return z.object({
    __typename: z.literal("SubscriptionState").optional(),
    customerId: z.string(),
    lastFailureReason: z.string().nullish(),
    plan: z.string(),
    processedEventIds: z.array(z.string()),
    seats: z.number(),
    status: SubscriptionStatusSchema,
  });
}
