/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsCustomContainerDocument,
  assertIsCustomContainerState,
  customContainerDocumentType,
  initialGlobalState,
  initialLocalState,
  isCustomContainerDocument,
  isCustomContainerState,
  utils,
} from "document-models/custom-container/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("CustomContainer Document Model", () => {
  it("should create a new CustomContainer document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(customContainerDocumentType);
  });

  it("should create a new CustomContainer document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isCustomContainerDocument(document)).toBe(true);
    expect(isCustomContainerState(document.state)).toBe(true);
  });
  it("should reject a document that is not a CustomContainer document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsCustomContainerDocument(wrongDocumentType)).toThrow();
      expect(isCustomContainerDocument(wrongDocumentType)).toBe(false);
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
    expect(isCustomContainerState(wrongState.state)).toBe(false);
    expect(assertIsCustomContainerState(wrongState.state)).toThrow();
    expect(isCustomContainerDocument(wrongState)).toBe(false);
    expect(assertIsCustomContainerDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isCustomContainerState(wrongInitialState.state)).toBe(false);
    expect(assertIsCustomContainerState(wrongInitialState.state)).toThrow();
    expect(isCustomContainerDocument(wrongInitialState)).toBe(false);
    expect(assertIsCustomContainerDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isCustomContainerDocument(missingIdInHeader)).toBe(false);
    expect(assertIsCustomContainerDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isCustomContainerDocument(missingNameInHeader)).toBe(false);
    expect(assertIsCustomContainerDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isCustomContainerDocument(missingCreatedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsCustomContainerDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isCustomContainerDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsCustomContainerDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
