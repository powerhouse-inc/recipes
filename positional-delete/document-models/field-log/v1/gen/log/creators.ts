/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { LogObservationInputSchema } from "../schema/zod.js";
import type { LogObservationInput } from "../types.js";
import type { LogObservationAction } from "./actions.js";

export const logObservation = (input: LogObservationInput) =>
  createAction<LogObservationAction>(
    "LOG_OBSERVATION",
    { ...input },
    undefined,
    LogObservationInputSchema,
    "global",
  );
