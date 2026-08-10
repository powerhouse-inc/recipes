/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsTeamJournalDocument,
  assertIsTeamJournalState,
  initialGlobalState,
  initialLocalState,
  isTeamJournalDocument,
  isTeamJournalState,
  teamJournalDocumentType,
  utils,
} from "document-models/team-journal/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("TeamJournal Document Model", () => {
  it("should create a new TeamJournal document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(teamJournalDocumentType);
  });

  it("should create a new TeamJournal document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isTeamJournalDocument(document)).toBe(true);
    expect(isTeamJournalState(document.state)).toBe(true);
  });
  it("should reject a document that is not a TeamJournal document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsTeamJournalDocument(wrongDocumentType)).toThrow();
      expect(isTeamJournalDocument(wrongDocumentType)).toBe(false);
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
    expect(isTeamJournalState(wrongState.state)).toBe(false);
    expect(assertIsTeamJournalState(wrongState.state)).toThrow();
    expect(isTeamJournalDocument(wrongState)).toBe(false);
    expect(assertIsTeamJournalDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isTeamJournalState(wrongInitialState.state)).toBe(false);
    expect(assertIsTeamJournalState(wrongInitialState.state)).toThrow();
    expect(isTeamJournalDocument(wrongInitialState)).toBe(false);
    expect(assertIsTeamJournalDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isTeamJournalDocument(missingIdInHeader)).toBe(false);
    expect(assertIsTeamJournalDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isTeamJournalDocument(missingNameInHeader)).toBe(false);
    expect(assertIsTeamJournalDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isTeamJournalDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsTeamJournalDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isTeamJournalDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsTeamJournalDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
