/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { AddEntryInput, PinEntryInput, SetTitleInput } from "../types.js";

export type AddEntryAction = Action & {
  type: "ADD_ENTRY";
  input: AddEntryInput;
};
export type PinEntryAction = Action & {
  type: "PIN_ENTRY";
  input: PinEntryInput;
};
export type SetTitleAction = Action & {
  type: "SET_TITLE";
  input: SetTitleInput;
};

export type TeamJournalJournalAction =
  | AddEntryAction
  | PinEntryAction
  | SetTitleAction;
