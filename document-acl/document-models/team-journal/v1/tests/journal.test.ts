import { generateMock } from "document-model";
import {
  addEntry,
  AddEntryInputSchema,
  isTeamJournalDocument,
  pinEntry,
  PinEntryInputSchema,
  reducer,
  setTitle,
  SetTitleInputSchema,
  utils,
} from "document-models/team-journal/v1";
import { describe, expect, it } from "vitest";

describe("JournalOperations", () => {
  it("should handle addEntry operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddEntryInputSchema());

    const updatedDocument = reducer(document, addEntry(input));

    expect(isTeamJournalDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_ENTRY");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle pinEntry operation", () => {
    const document = utils.createDocument();
    const input = generateMock(PinEntryInputSchema());

    const updatedDocument = reducer(document, pinEntry(input));

    expect(isTeamJournalDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("PIN_ENTRY");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setTitle operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetTitleInputSchema());

    const updatedDocument = reducer(document, setTitle(input));

    expect(isTeamJournalDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_TITLE");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
