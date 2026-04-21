import { PHDocumentController } from "document-model";
import { RoleBasedAuth } from "../module.js";
import type { RoleBasedAuthAction, RoleBasedAuthPHState } from "./types.js";

export const RoleBasedAuthController = PHDocumentController.forDocumentModel<
  RoleBasedAuthPHState,
  RoleBasedAuthAction
>(RoleBasedAuth);
