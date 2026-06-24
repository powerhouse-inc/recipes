/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsPaymentDocument,
  assertIsPaymentState,
  initialGlobalState,
  initialLocalState,
  isPaymentDocument,
  isPaymentState,
  paymentDocumentType,
  utils,
} from "document-models/payment/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Payment Document Model", () => {
  it("should create a new Payment document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(paymentDocumentType);
  });

  it("should create a new Payment document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isPaymentDocument(document)).toBe(true);
    expect(isPaymentState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Payment document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsPaymentDocument(wrongDocumentType)).toThrow();
      expect(isPaymentDocument(wrongDocumentType)).toBe(false);
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
    expect(isPaymentState(wrongState.state)).toBe(false);
    expect(assertIsPaymentState(wrongState.state)).toThrow();
    expect(isPaymentDocument(wrongState)).toBe(false);
    expect(assertIsPaymentDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isPaymentState(wrongInitialState.state)).toBe(false);
    expect(assertIsPaymentState(wrongInitialState.state)).toThrow();
    expect(isPaymentDocument(wrongInitialState)).toBe(false);
    expect(assertIsPaymentDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isPaymentDocument(missingIdInHeader)).toBe(false);
    expect(assertIsPaymentDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isPaymentDocument(missingNameInHeader)).toBe(false);
    expect(assertIsPaymentDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isPaymentDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsPaymentDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isPaymentDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsPaymentDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
