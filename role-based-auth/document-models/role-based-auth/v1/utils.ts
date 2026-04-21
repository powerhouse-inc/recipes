import type { DocumentModelUtils } from "document-model";
import type { RoleBasedAuthPHState } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the RoleBasedAuth document model */
export const utils: DocumentModelUtils<RoleBasedAuthPHState> = {
  ...genUtils,
  ...customUtils,
};
