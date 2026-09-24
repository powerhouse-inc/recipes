/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddLineItemInputSchema,
  DeleteLineItemInputSchema,
  UpdateLineItemInputSchema,
} from "../schema/zod.js";
import type {
  AddLineItemInput,
  DeleteLineItemInput,
  UpdateLineItemInput,
} from "../types.js";
import type {
  AddLineItemAction,
  DeleteLineItemAction,
  UpdateLineItemAction,
} from "./actions.js";

export const addLineItem = (input: AddLineItemInput) =>
  createAction<AddLineItemAction>(
    "ADD_LINE_ITEM",
    { ...input },
    undefined,
    AddLineItemInputSchema,
    "global",
  );

export const updateLineItem = (input: UpdateLineItemInput) =>
  createAction<UpdateLineItemAction>(
    "UPDATE_LINE_ITEM",
    { ...input },
    undefined,
    UpdateLineItemInputSchema,
    "global",
  );

export const deleteLineItem = (input: DeleteLineItemInput) =>
  createAction<DeleteLineItemAction>(
    "DELETE_LINE_ITEM",
    { ...input },
    undefined,
    DeleteLineItemInputSchema,
    "global",
  );
