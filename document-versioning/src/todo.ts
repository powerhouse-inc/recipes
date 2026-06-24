import { baseCreateDocument, defaultBaseState } from "document-model";
import {
  todoDocumentType,
  type TodoDocument as TodoV1Document,
  type TodoItem as TodoItemV1,
  type TodoPHState as TodoV1PHState,
} from "document-models/todo/v1";

/**
 * Builds a v1 state that declares model version 1.
 *
 * The generated `utils.createState` always starts from `defaultBaseState()`,
 * whose `document.version` is 0 — fine when a reactor stamps the version from
 * the registered module, but this recipe creates documents in-process. A v1
 * document must declare version 1: the upgrade manifest covers 1→2 and has no
 * transition *into* v1, so leaving it at 0 would give computeUpgradePath
 * nowhere to start.
 */
function createV1State(state?: Partial<TodoV1PHState>): TodoV1PHState {
  const base = defaultBaseState();
  return {
    ...base,
    document: { ...base.document, version: 1 },
    global: { items: [], ...state?.global },
    local: {},
  };
}

/**
 * Creates a v1 Todo document at version 1. Passing the document type makes
 * `baseCreateDocument` seed the document-scope log (CREATE_DOCUMENT plus the
 * genesis UPGRADE_DOCUMENT 0→1), just like the platform does on creation.
 */
export function createV1Todo(items: TodoItemV1[] = []): TodoV1Document {
  return baseCreateDocument(createV1State, { global: { items } }, todoDocumentType);
}
