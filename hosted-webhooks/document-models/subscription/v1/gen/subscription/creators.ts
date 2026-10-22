/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ActivateInputSchema,
  CancelInputSchema,
  MarkPastDueInputSchema,
} from "../schema/zod.js";
import type { ActivateInput, CancelInput, MarkPastDueInput } from "../types.js";
import type {
  ActivateAction,
  CancelAction,
  MarkPastDueAction,
} from "./actions.js";

export const activate = (input: ActivateInput) =>
  createAction<ActivateAction>(
    "ACTIVATE",
    { ...input },
    undefined,
    ActivateInputSchema,
    "global",
  );

export const markPastDue = (input: MarkPastDueInput) =>
  createAction<MarkPastDueAction>(
    "MARK_PAST_DUE",
    { ...input },
    undefined,
    MarkPastDueInputSchema,
    "global",
  );

export const cancel = (input: CancelInput) =>
  createAction<CancelAction>(
    "CANCEL",
    { ...input },
    undefined,
    CancelInputSchema,
    "global",
  );
