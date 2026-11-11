/**
 * Version 1 of the checklist model: its metadata, state types and initial
 * state. The model has no local state, so `scopes` declares only `global`.
 */
import { defineDocumentModel, ph } from "document-model";

export const ChecklistItem = ph.object("ChecklistItem", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
    done: ph.Boolean({ required: true }),
  },
});

export const checklistConfig = {
  id: "recipes/checklist",
  name: "Checklist",
  description: "A list of items to tick off.",
  extension: ".checklist",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
} as const;

export const ChecklistState = ph.object("ChecklistState", {
  fields: {
    items: ph.list(ph.ref(ChecklistItem, { required: true }), {
      required: true,
    }),
  },
});

export const checklistModel = defineDocumentModel({
  ...checklistConfig,
  scopes: {
    global: { schema: ChecklistState, initialValue: { items: [] } },
    // No `local` entry. Leaving it out means
    // `local: { schema: null, initialValue: {} }`.
  },
});
