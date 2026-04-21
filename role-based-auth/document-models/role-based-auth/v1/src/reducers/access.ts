import type { RoleBasedAuthState } from "../../gen/types.js";
import {
  AddressAlreadyAdmin,
  AlreadyBootstrapped,
  CannotRevokeCreator,
  LastAdmin,
  NotAdmin,
  NotAuthorized,
} from "../../gen/access/error.js";
import type { RoleBasedAuthAccessOperations } from "document-models/role-based-auth/v1";

function requireSigner(action: {
  context?: { signer?: { user: { address: string } } };
}): string {
  const address = action.context?.signer?.user?.address;
  if (!address) {
    throw new NotAuthorized("User is not authenticated");
  }
  return address;
}

function requireAdmin(state: RoleBasedAuthState, address: string): void {
  if (!state.admins.includes(address)) {
    throw new NotAdmin(`${address} is not an admin`);
  }
}

export const roleBasedAuthAccessOperations: RoleBasedAuthAccessOperations = {
  bootstrapOperation(state, action) {
    const address = requireSigner(action);
    if (state.creator) {
      throw new AlreadyBootstrapped("Document already bootstrapped");
    }
    state.creator = address;
    state.admins.push(address);
  },

  grantAdminOperation(state, action) {
    const address = requireSigner(action);
    requireAdmin(state, address);
    const target = action.input.address;
    if (state.admins.includes(target)) {
      return;
    }
    state.admins.push(target);
    state.members = state.members.filter((m) => m !== target);
  },

  revokeAdminOperation(state, action) {
    const address = requireSigner(action);
    requireAdmin(state, address);
    const target = action.input.address;
    if (target === state.creator) {
      throw new CannotRevokeCreator("The creator cannot be demoted");
    }
    if (state.admins.length === 1 && state.admins[0] === target) {
      throw new LastAdmin("Cannot remove the last admin");
    }
    state.admins = state.admins.filter((a) => a !== target);
  },

  addMemberOperation(state, action) {
    const address = requireSigner(action);
    requireAdmin(state, address);
    const target = action.input.address;
    if (state.admins.includes(target)) {
      throw new AddressAlreadyAdmin(`${target} is already an admin`);
    }
    if (state.members.includes(target)) {
      return;
    }
    state.members.push(target);
  },

  removeMemberOperation(state, action) {
    const address = requireSigner(action);
    requireAdmin(state, address);
    const target = action.input.address;
    state.members = state.members.filter((m) => m !== target);
  },

  writeNoteOperation(state, action) {
    const address = requireSigner(action);
    const isAdmin = state.admins.includes(address);
    const isMember = state.members.includes(address);
    if (!isAdmin && !isMember) {
      throw new NotAuthorized(`${address} has no role`);
    }
    state.notes.push({
      id: action.input.id,
      author: address,
      text: action.input.text,
      createdAt: action.input.createdAt,
    });
  },
};
