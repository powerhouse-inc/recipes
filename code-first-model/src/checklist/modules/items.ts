/**
 * The checklist item operations. Each one declares its input and its errors
 * and changes the global state in place.
 */
import { ph } from "document-model";
import { checklistModel } from "../definition.js";

export const checklistItems = checklistModel.module("items", {
  operations: ({ global }) => ({
    addItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      errors: { DuplicateItem: { code: "DUPLICATE_ITEM" } },
      reduce(state, input, { errors }) {
        if (state.items.some((item) => item.id === input.id)) {
          throw new errors.DuplicateItem(
            `Item ${input.id} is already in the list.`,
          );
        }
        state.items.push({ id: input.id, label: input.label, done: false });
      },
    }),

    setItemDone: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          done: ph.Boolean({ required: true }),
        },
      }),
      errors: { MissingItem: { code: "MISSING_ITEM" } },
      reduce(state, input, { errors }) {
        const item = state.items.find((candidate) => candidate.id === input.id);
        if (item === undefined) {
          throw new errors.MissingItem(`No item has id ${input.id}.`);
        }
        item.done = input.done;
      },
    }),
  }),
});
