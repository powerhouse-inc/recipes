/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  FieldLogState,
  LogObservationInput,
  Observation,
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

export function FieldLogStateSchema(): z.ZodObject<Properties<FieldLogState>> {
  return z.object({
    __typename: z.literal("FieldLogState").optional(),
    observations: z.array(z.lazy(() => ObservationSchema())),
  });
}

export function LogObservationInputSchema(): z.ZodObject<
  Properties<LogObservationInput>
> {
  return z.object({
    id: z.string(),
    note: z.string(),
  });
}

export function ObservationSchema(): z.ZodObject<Properties<Observation>> {
  return z.object({
    __typename: z.literal("Observation").optional(),
    id: z.string(),
    note: z.string(),
    recordedBy: z.string(),
  });
}
