import { generateMock } from "document-model/mock";
import {
  isFieldLogDocument,
  logObservation,
  LogObservationInputSchema,
  reducer,
  utils,
} from "document-models/field-log/v1";
import { describe, expect, it } from "vitest";

describe("LogOperations", () => {
  it("should handle logObservation operation", () => {
    const document = utils.createDocument();
    const input = generateMock(LogObservationInputSchema());

    const updatedDocument = reducer(document, logObservation(input));

    expect(isFieldLogDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "LOG_OBSERVATION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
