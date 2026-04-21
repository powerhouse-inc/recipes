import { baseActions } from "document-model";
import { roleBasedAuthAccessActions } from "./gen/creators.js";

/** Actions for the RoleBasedAuth document model */

export const actions = { ...baseActions, ...roleBasedAuthAccessActions };
