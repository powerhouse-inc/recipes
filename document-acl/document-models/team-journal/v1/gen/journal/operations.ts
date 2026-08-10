/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { TeamJournalGlobalState } from "../types.js";
import type {
  AddEntryAction,
  PinEntryAction,
  SetTitleAction,
} from "./actions.js";

export interface TeamJournalJournalOperations {
  addEntryOperation: (
    state: TeamJournalGlobalState,
    action: AddEntryAction,
    dispatch?: SignalDispatch,
  ) => void;
  pinEntryOperation: (
    state: TeamJournalGlobalState,
    action: PinEntryAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTitleOperation: (
    state: TeamJournalGlobalState,
    action: SetTitleAction,
    dispatch?: SignalDispatch,
  ) => void;
}
