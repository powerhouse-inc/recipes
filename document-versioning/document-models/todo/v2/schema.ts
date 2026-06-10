import { z } from "zod";

export const TodoItemStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export const AddItemInputSchema = () =>
  z.object({
    id: z.string(),
    title: z.string(),
    status: TodoItemStatusSchema.default("TODO"),
    priority: z.number().int().default(0),
  });

export const SetStatusInputSchema = () =>
  z.object({
    id: z.string(),
    status: TodoItemStatusSchema,
  });

export const SetPriorityInputSchema = () =>
  z.object({
    id: z.string(),
    priority: z.number().int(),
  });

export type AddItemInput = z.input<ReturnType<typeof AddItemInputSchema>>;
export type SetStatusInput = z.infer<ReturnType<typeof SetStatusInputSchema>>;
export type SetPriorityInput = z.infer<ReturnType<typeof SetPriorityInputSchema>>;
