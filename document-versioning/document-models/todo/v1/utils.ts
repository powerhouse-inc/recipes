import {
  baseCreateDocument,
  defaultBaseState,
  defaultDocumentState,
} from "document-model";
import { todoDocumentType } from "../document-type.js";
import type { TodoV1Document, TodoV1PHState } from "./types.js";

export function createState(state?: Partial<TodoV1PHState>): TodoV1PHState {
  return {
    ...defaultBaseState(),
    // defaultDocumentState() starts at version 0; a v1 document must declare
    // version 1, because the upgrade manifest has no transition into v1.
    document: { ...defaultDocumentState(), version: 1 },
    global: { items: [], ...state?.global },
    local: {},
  };
}

export function createDocument(state?: Partial<TodoV1PHState>): TodoV1Document {
  // Passing the document type makes baseCreateDocument seed the
  // document-scope operations (CREATE_DOCUMENT + UPGRADE_DOCUMENT 0→1).
  return baseCreateDocument(createState, state, todoDocumentType);
}
