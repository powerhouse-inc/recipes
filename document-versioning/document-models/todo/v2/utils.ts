import {
  baseCreateDocument,
  defaultBaseState,
  defaultDocumentState,
} from "document-model";
import { todoDocumentType } from "../document-type.js";
import type { TodoV2Document, TodoV2PHState } from "./types.js";

export function createState(state?: Partial<TodoV2PHState>): TodoV2PHState {
  return {
    ...defaultBaseState(),
    // Documents born on v2 declare version 2 directly — the manifest's
    // transitions only cover upgrades from older versions, not creation.
    document: { ...defaultDocumentState(), version: 2 },
    global: { items: [], ...state?.global },
    local: {},
  };
}

export function createDocument(state?: Partial<TodoV2PHState>): TodoV2Document {
  // Passing the document type makes baseCreateDocument seed the
  // document-scope operations (CREATE_DOCUMENT + UPGRADE_DOCUMENT 0→2).
  return baseCreateDocument(createState, state, todoDocumentType);
}
