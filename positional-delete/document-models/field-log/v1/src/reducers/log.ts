import { DuplicateObservation } from "../../gen/log/error.js";
import type { FieldLogLogOperations } from "document-models/field-log/v1";

export const fieldLogLogOperations: FieldLogLogOperations = {
  logObservationOperation(state, action) {
    if (
      state.observations.some(
        (observation) => observation.id === action.input.id,
      )
    ) {
      throw new DuplicateObservation(
        `Observation ${action.input.id} already exists`,
      );
    }
    state.observations.push({
      id: action.input.id,
      note: action.input.note,
      recordedBy: action.context?.signer?.user?.address ?? "anonymous",
    });
  },
};
