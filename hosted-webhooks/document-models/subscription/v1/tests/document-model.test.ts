/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsSubscriptionDocument,
  assertIsSubscriptionState,
  initialGlobalState,
  initialLocalState,
  isSubscriptionDocument,
  isSubscriptionState,
  subscriptionDocumentType,
  utils,
} from "document-models/subscription/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Subscription Document Model", () => {
  it("should create a new Subscription document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(subscriptionDocumentType);
  });

  it("should create a new Subscription document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isSubscriptionDocument(document)).toBe(true);
    expect(isSubscriptionState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Subscription document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsSubscriptionDocument(wrongDocumentType)).toThrow();
      expect(isSubscriptionDocument(wrongDocumentType)).toBe(false);
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
    expect(isSubscriptionState(wrongState.state)).toBe(false);
    expect(assertIsSubscriptionState(wrongState.state)).toThrow();
    expect(isSubscriptionDocument(wrongState)).toBe(false);
    expect(assertIsSubscriptionDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isSubscriptionState(wrongInitialState.state)).toBe(false);
    expect(assertIsSubscriptionState(wrongInitialState.state)).toThrow();
    expect(isSubscriptionDocument(wrongInitialState)).toBe(false);
    expect(assertIsSubscriptionDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isSubscriptionDocument(missingIdInHeader)).toBe(false);
    expect(assertIsSubscriptionDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isSubscriptionDocument(missingNameInHeader)).toBe(false);
    expect(assertIsSubscriptionDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isSubscriptionDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsSubscriptionDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isSubscriptionDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsSubscriptionDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
