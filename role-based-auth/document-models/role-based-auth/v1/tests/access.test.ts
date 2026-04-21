import { describe, expect, it } from "vitest";
import type { Action } from "document-model";
import {
  addMember,
  bootstrap,
  grantAdmin,
  removeMember,
  reducer,
  revokeAdmin,
  utils,
  writeNote,
  type RoleBasedAuthDocument, isRoleBasedAuthDocument, BootstrapInputSchema, GrantAdminInputSchema, RevokeAdminInputSchema, AddMemberInputSchema, RemoveMemberInputSchema, WriteNoteInputSchema } from "document-models/role-based-auth/v1";

const ALICE = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const BOB = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";
const CAROL = "0xCCcccCCcCccCccccCCCccccCccCcCcccccCCCCc2";
const DAVE = "0xDDddDdDdDDdDdddDdddDDDdDdDdDddDdDDdddDDd3";

function signed<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "example", key: "example" },
        signatures: [],
      },
    },
  };
}

function dispatch(
  document: RoleBasedAuthDocument,
  action: Action,
): RoleBasedAuthDocument {
  return reducer(document, action);
}

function stateOf(document: RoleBasedAuthDocument) {
  return document.state.global;
}

function lastError(document: RoleBasedAuthDocument): string | undefined {
  const ops = document.operations.global;
  return ops[ops.length - 1]?.error;
}

describe("role-based-auth reducer authorization", () => {
  it("rejects any action without a signer", () => {
    const doc = dispatch(utils.createDocument(), bootstrap({}));
    expect(lastError(doc)).toMatch(/not authenticated/i);
    expect(stateOf(doc).creator).toBeNull();
  });

  it("makes the first caller the creator and an admin", () => {
    const doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    expect(stateOf(doc).creator).toBe(ALICE);
    expect(stateOf(doc).admins).toEqual([ALICE]);
  });

  it("rejects a second bootstrap", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(bootstrap({}), BOB));
    expect(lastError(doc)).toMatch(/already bootstrapped/i);
    expect(stateOf(doc).creator).toBe(ALICE);
  });

  it("rejects role mutations from non-admins", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(addMember({ address: CAROL }), BOB));
    expect(lastError(doc)).toMatch(/not an admin/i);
    expect(stateOf(doc).members).toEqual([]);
  });

  it("lets an admin add and remove members", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(addMember({ address: BOB }), ALICE));
    expect(stateOf(doc).members).toEqual([BOB]);
    doc = dispatch(doc, signed(removeMember({ address: BOB }), ALICE));
    expect(stateOf(doc).members).toEqual([]);
  });

  it("refuses to add an existing admin as a member", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(addMember({ address: ALICE }), ALICE));
    expect(lastError(doc)).toMatch(/already an admin/i);
  });

  it("grantAdmin moves an existing member into admins", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(addMember({ address: BOB }), ALICE));
    doc = dispatch(doc, signed(grantAdmin({ address: BOB }), ALICE));
    expect(stateOf(doc).admins).toEqual([ALICE, BOB]);
    expect(stateOf(doc).members).toEqual([]);
  });

  it("revokeAdmin cannot demote the creator", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(grantAdmin({ address: BOB }), ALICE));
    doc = dispatch(doc, signed(revokeAdmin({ address: ALICE }), BOB));
    expect(lastError(doc)).toMatch(/creator cannot be demoted/i);
    expect(stateOf(doc).admins).toEqual([ALICE, BOB]);
  });

  it("revokeAdmin removes a non-creator admin", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(grantAdmin({ address: BOB }), ALICE));
    expect(stateOf(doc).admins).toEqual([ALICE, BOB]);
    doc = dispatch(doc, signed(revokeAdmin({ address: BOB }), ALICE));
    expect(stateOf(doc).admins).toEqual([ALICE]);
  });

  it("writeNote rejects a caller with no role", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(
      doc,
      signed(
        writeNote({ id: "n1", text: "hi", createdAt: "2026-01-01T00:00:00Z" }),
        DAVE,
      ),
    );
    expect(lastError(doc)).toMatch(/no role/i);
    expect(stateOf(doc).notes).toHaveLength(0);
  });

  it("writeNote accepts a member and stamps the author", () => {
    let doc = dispatch(utils.createDocument(), signed(bootstrap({}), ALICE));
    doc = dispatch(doc, signed(addMember({ address: BOB }), ALICE));
    doc = dispatch(
      doc,
      signed(
        writeNote({ id: "n1", text: "hello", createdAt: "2026-01-01T00:00:00Z" }),
        BOB,
      ),
    );
    expect(stateOf(doc).notes).toHaveLength(1);
    expect(stateOf(doc).notes[0]).toMatchObject({
      id: "n1",
      author: BOB,
      text: "hello",
    });
  });
});
