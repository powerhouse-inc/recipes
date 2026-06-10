/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils } from "document-model";
// at document-model@6.0.2-staging.2 these are only exported from the /core subpath
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model/core";
import {
  assertIsExpenseReportDocument,
  assertIsExpenseReportState,
  isExpenseReportDocument,
  isExpenseReportState,
} from "./document-schema.js";
import { expenseReportDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ExpenseReportGlobalState,
  ExpenseReportLocalState,
  ExpenseReportPHState,
} from "./types.js";

export const initialGlobalState: ExpenseReportGlobalState = { lineItems: [] };
export const initialLocalState: ExpenseReportLocalState = {};

export const utils: DocumentModelUtils<ExpenseReportPHState> = {
  fileExtension: "exprep",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    // baseCreateDocument at document-model@6.0.2-staging.2 takes no document
    // type argument, so the header is patched manually
    const document = baseCreateDocument(utils.createState, state);
    document.header.documentType = expenseReportDocumentType;
    document.header.id = generateId();
    return document;
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state) {
    return isExpenseReportState(state);
  },
  assertIsStateOfType(state) {
    return assertIsExpenseReportState(state);
  },
  isDocumentOfType(document) {
    return isExpenseReportDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsExpenseReportDocument(document);
  },
};
