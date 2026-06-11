/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type { CustomContainerState, SetMetadataInput } from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function CustomContainerStateSchema(): z.ZodObject<
  Properties<CustomContainerState>
> {
  return z.object({
    __typename: z.literal("CustomContainerState").optional(),
    description: z.string().nullish(),
    name: z.string(),
  });
}

export function SetMetadataInputSchema(): z.ZodObject<
  Properties<SetMetadataInput>
> {
  return z.object({
    description: z.string().nullish(),
    name: z.string(),
  });
}
