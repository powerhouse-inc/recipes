/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsFieldLogDocument,
  assertIsFieldLogState,
  fieldLogDocumentType,
  initialGlobalState,
  initialLocalState,
  isFieldLogDocument,
  isFieldLogState,
  utils,
} from "document-models/field-log/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("FieldLog Document Model", () => {
  it("should create a new FieldLog document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(fieldLogDocumentType);
  });

  it("should create a new FieldLog document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isFieldLogDocument(document)).toBe(true);
    expect(isFieldLogState(document.state)).toBe(true);
  });
  it("should reject a document that is not a FieldLog document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsFieldLogDocument(wrongDocumentType)).toThrow();
      expect(isFieldLogDocument(wrongDocumentType)).toBe(false);
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
    expect(isFieldLogState(wrongState.state)).toBe(false);
    expect(assertIsFieldLogState(wrongState.state)).toThrow();
    expect(isFieldLogDocument(wrongState)).toBe(false);
    expect(assertIsFieldLogDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isFieldLogState(wrongInitialState.state)).toBe(false);
    expect(assertIsFieldLogState(wrongInitialState.state)).toThrow();
    expect(isFieldLogDocument(wrongInitialState)).toBe(false);
    expect(assertIsFieldLogDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isFieldLogDocument(missingIdInHeader)).toBe(false);
    expect(assertIsFieldLogDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isFieldLogDocument(missingNameInHeader)).toBe(false);
    expect(assertIsFieldLogDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isFieldLogDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsFieldLogDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isFieldLogDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsFieldLogDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
