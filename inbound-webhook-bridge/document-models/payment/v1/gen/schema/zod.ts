/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  MarkFailedInput,
  PaymentState,
  PaymentStatus,
  RecordPaymentInput,
  RecordRefundInput,
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

export const PaymentStatusSchema = z.enum([
  "FAILED",
  "PAID",
  "PENDING",
  "REFUNDED",
]);

export function MarkFailedInputSchema(): z.ZodObject<
  Properties<MarkFailedInput>
> {
  return z.object({
    eventId: z.string(),
    reason: z.string(),
  });
}

export function PaymentStateSchema(): z.ZodObject<Properties<PaymentState>> {
  return z.object({
    __typename: z.literal("PaymentState").optional(),
    amountCents: z.number(),
    currency: z.string(),
    failureReason: z.string().nullish(),
    orderId: z.string(),
    processedEventIds: z.array(z.string()),
    status: PaymentStatusSchema,
  });
}

export function RecordPaymentInputSchema(): z.ZodObject<
  Properties<RecordPaymentInput>
> {
  return z.object({
    amountCents: z.number(),
    eventId: z.string(),
  });
}

export function RecordRefundInputSchema(): z.ZodObject<
  Properties<RecordRefundInput>
> {
  return z.object({
    amountCents: z.number(),
    eventId: z.string(),
  });
}
