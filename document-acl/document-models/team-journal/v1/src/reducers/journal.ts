import {
  DuplicateEntry,
  EntryNotFound,
} from "../../gen/journal/error.js";
import type { TeamJournalJournalOperations } from "document-models/team-journal/v1";

export const teamJournalJournalOperations: TeamJournalJournalOperations = {
  addEntryOperation(state, action) {
    if (state.entries.some((entry) => entry.id === action.input.id)) {
      throw new DuplicateEntry(`Entry ${action.input.id} already exists`);
    }
    state.entries.push({
      id: action.input.id,
      author: action.context?.signer?.user?.address ?? "anonymous",
      text: action.input.text,
      pinned: false,
    });
  },
  pinEntryOperation(state, action) {
    const entry = state.entries.find(
      (candidate) => candidate.id === action.input.id,
    );
    if (!entry) {
      throw new EntryNotFound(`No entry ${action.input.id}`);
    }
    entry.pinned = true;
  },
  setTitleOperation(state, action) {
    state.title = action.input.title;
  },
};
