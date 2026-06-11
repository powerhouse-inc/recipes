/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsFeedLedgerDocument,
  assertIsFeedLedgerState,
  feedLedgerDocumentType,
  initialGlobalState,
  initialLocalState,
  isFeedLedgerDocument,
  isFeedLedgerState,
  utils,
} from "document-models/feed-ledger/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("FeedLedger Document Model", () => {
  it("should create a new FeedLedger document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(feedLedgerDocumentType);
  });

  it("should create a new FeedLedger document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isFeedLedgerDocument(document)).toBe(true);
    expect(isFeedLedgerState(document.state)).toBe(true);
  });
  it("should reject a document that is not a FeedLedger document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsFeedLedgerDocument(wrongDocumentType)).toThrow();
      expect(isFeedLedgerDocument(wrongDocumentType)).toBe(false);
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
    expect(isFeedLedgerState(wrongState.state)).toBe(false);
    expect(assertIsFeedLedgerState(wrongState.state)).toThrow();
    expect(isFeedLedgerDocument(wrongState)).toBe(false);
    expect(assertIsFeedLedgerDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isFeedLedgerState(wrongInitialState.state)).toBe(false);
    expect(assertIsFeedLedgerState(wrongInitialState.state)).toThrow();
    expect(isFeedLedgerDocument(wrongInitialState)).toBe(false);
    expect(assertIsFeedLedgerDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isFeedLedgerDocument(missingIdInHeader)).toBe(false);
    expect(assertIsFeedLedgerDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isFeedLedgerDocument(missingNameInHeader)).toBe(false);
    expect(assertIsFeedLedgerDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isFeedLedgerDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsFeedLedgerDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isFeedLedgerDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsFeedLedgerDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
