/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { Payment } from "../module.js";
import type { PaymentAction, PaymentPHState } from "./types.js";

export const PaymentController = PHDocumentController.forDocumentModel<
  PaymentPHState,
  PaymentAction
>(Payment);
