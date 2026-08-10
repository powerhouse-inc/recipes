/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddEntryInputSchema,
  PinEntryInputSchema,
  SetTitleInputSchema,
} from "../schema/zod.js";
import type { AddEntryInput, PinEntryInput, SetTitleInput } from "../types.js";
import type {
  AddEntryAction,
  PinEntryAction,
  SetTitleAction,
} from "./actions.js";

export const addEntry = (input: AddEntryInput) =>
  createAction<AddEntryAction>(
    "ADD_ENTRY",
    { ...input },
    undefined,
    AddEntryInputSchema,
    "global",
  );

export const pinEntry = (input: PinEntryInput) =>
  createAction<PinEntryAction>(
    "PIN_ENTRY",
    { ...input },
    undefined,
    PinEntryInputSchema,
    "global",
  );

export const setTitle = (input: SetTitleInput) =>
  createAction<SetTitleAction>(
    "SET_TITLE",
    { ...input },
    undefined,
    SetTitleInputSchema,
    "global",
  );
