/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetMetadataInputSchema } from "../schema/zod.js";
import type { SetMetadataInput } from "../types.js";
import type { SetMetadataAction } from "./actions.js";

export const setMetadata = (input: SetMetadataInput) =>
  createAction<SetMetadataAction>(
    "SET_METADATA",
    { ...input },
    undefined,
    SetMetadataInputSchema,
    "global",
  );
