/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsRoleBasedAuthDocument,
  assertIsRoleBasedAuthState,
  initialGlobalState,
  initialLocalState,
  isRoleBasedAuthDocument,
  isRoleBasedAuthState,
  roleBasedAuthDocumentType,
  utils,
} from "document-models/role-based-auth/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("RoleBasedAuth Document Model", () => {
  it("should create a new RoleBasedAuth document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(roleBasedAuthDocumentType);
  });

  it("should create a new RoleBasedAuth document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isRoleBasedAuthDocument(document)).toBe(true);
    expect(isRoleBasedAuthState(document.state)).toBe(true);
  });
  it("should reject a document that is not a RoleBasedAuth document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsRoleBasedAuthDocument(wrongDocumentType)).toThrow();
      expect(isRoleBasedAuthDocument(wrongDocumentType)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
  });
  const wrongState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongState.state.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isRoleBasedAuthState(wrongState.state)).toBe(false);
    expect(assertIsRoleBasedAuthState(wrongState.state)).toThrow();
    expect(isRoleBasedAuthDocument(wrongState)).toBe(false);
    expect(assertIsRoleBasedAuthDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isRoleBasedAuthState(wrongInitialState.state)).toBe(false);
    expect(assertIsRoleBasedAuthState(wrongInitialState.state)).toThrow();
    expect(isRoleBasedAuthDocument(wrongInitialState)).toBe(false);
    expect(assertIsRoleBasedAuthDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isRoleBasedAuthDocument(missingIdInHeader)).toBe(false);
    expect(assertIsRoleBasedAuthDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isRoleBasedAuthDocument(missingNameInHeader)).toBe(false);
    expect(assertIsRoleBasedAuthDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isRoleBasedAuthDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsRoleBasedAuthDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isRoleBasedAuthDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsRoleBasedAuthDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
