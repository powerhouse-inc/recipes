/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddLineItemInput,
  DeleteLineItemInput,
  ExpenseReportState,
  LineItem,
  UpdateLineItemInput,
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

export function AddLineItemInputSchema(): z.ZodObject<
  Properties<AddLineItemInput>
> {
  return z.object({
    amount: z.number(),
    category: z.string(),
    currency: z.string(),
    date: z.string(),
    id: z.string(),
  });
}

export function DeleteLineItemInputSchema(): z.ZodObject<
  Properties<DeleteLineItemInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ExpenseReportStateSchema(): z.ZodObject<
  Properties<ExpenseReportState>
> {
  return z.object({
    __typename: z.literal("ExpenseReportState").optional(),
    lineItems: z.array(z.lazy(() => LineItemSchema())),
  });
}

export function LineItemSchema(): z.ZodObject<Properties<LineItem>> {
  return z.object({
    __typename: z.literal("LineItem").optional(),
    amount: z.number(),
    category: z.string(),
    currency: z.string(),
    date: z.string(),
    id: z.string(),
  });
}

export function UpdateLineItemInputSchema(): z.ZodObject<
  Properties<UpdateLineItemInput>
> {
  return z.object({
    amount: z.number().nullish(),
    category: z.string().nullish(),
    currency: z.string().nullish(),
    date: z.string().nullish(),
    id: z.string(),
  });
}
