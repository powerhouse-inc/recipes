/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model";
import type { RoleBasedAuthPHState } from "document-models/role-based-auth/v1";

import { roleBasedAuthAccessOperations } from "../src/reducers/access.js";

import {
  BootstrapInputSchema,
  GrantAdminInputSchema,
  RevokeAdminInputSchema,
  AddMemberInputSchema,
  RemoveMemberInputSchema,
  WriteNoteInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<RoleBasedAuthPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "BOOTSTRAP": {
      BootstrapInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.bootstrapOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "GRANT_ADMIN": {
      GrantAdminInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.grantAdminOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REVOKE_ADMIN": {
      RevokeAdminInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.revokeAdminOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_MEMBER": {
      AddMemberInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.addMemberOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_MEMBER": {
      RemoveMemberInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.removeMemberOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "WRITE_NOTE": {
      WriteNoteInputSchema().parse(action.input);

      roleBasedAuthAccessOperations.writeNoteOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<RoleBasedAuthPHState> =
  createReducer(stateReducer);
