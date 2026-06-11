import type { CustomContainerMetadataOperations } from "document-models/custom-container/v1";

export const customContainerMetadataOperations: CustomContainerMetadataOperations =
  {
    setMetadataOperation(state, action) {
      state.name = action.input.name;
      state.description = action.input.description ?? null;
    },
  };
