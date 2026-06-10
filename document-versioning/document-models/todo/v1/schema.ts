import { z } from "zod";

export const AddItemInputSchema = () =>
  z.object({
    id: z.string(),
    title: z.string(),
  });

export const CheckItemInputSchema = () =>
  z.object({
    id: z.string(),
    checked: z.boolean(),
  });

export type AddItemInput = z.infer<ReturnType<typeof AddItemInputSchema>>;
export type CheckItemInput = z.infer<ReturnType<typeof CheckItemInputSchema>>;
