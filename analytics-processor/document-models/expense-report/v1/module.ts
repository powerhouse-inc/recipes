/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelModule } from "document-model";
// at document-model@6.0.2-staging.2 defaultBaseState is only exported from the
// /core subpath, while createState only from the package root
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import { actions } from "./actions.js";
import { documentModel } from "./gen/document-model.js";
import { reducer } from "./gen/reducer.js";
import type { ExpenseReportPHState } from "./gen/types.js";
import { utils } from "./utils.js";

/** Document model module for the ExpenseReport document type */
export const ExpenseReport = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
} as const satisfies DocumentModelModule<ExpenseReportPHState>;
