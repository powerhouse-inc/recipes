import { generateMock } from "document-model";
import {
  isCustomContainerDocument,
  reducer,
  setMetadata,
  SetMetadataInputSchema,
  utils,
} from "document-models/custom-container/v1";
import { describe, expect, it } from "vitest";

describe("MetadataOperations", () => {
  it("should handle setMetadata operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetMetadataInputSchema());

    const updatedDocument = reducer(document, setMetadata(input));

    expect(isCustomContainerDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_METADATA",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
