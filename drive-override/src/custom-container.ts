/**
 * Minimal custom container document model.
 *
 * The state holds only metadata — there is no children array. Children are
 * tracked in the reactor's DocumentRelationship table via ADD_RELATIONSHIP,
 * so the container's state stays O(1) regardless of how many children exist.
 */
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  createReducer,
  defaultBaseState,
  generateId,
  isDocumentAction,
} from "document-model/core";
import { createState } from "document-model";
import type {
  Action,
  CreateState,
  DocumentModelGlobalState,
  DocumentModelModule,
  DocumentModelUtils,
  PHBaseState,
  PHDocument,
  Reducer,
  StateReducer,
} from "document-model";

// ---------- Document type identifier ----------

export const customContainerDocumentType = "powerhouse/custom-container";
export const customContainerFileExtension = "cco";

// ---------- State + action types ----------

export type CustomContainerGlobalState = {
  name: string;
  description: string | null;
};
export type CustomContainerLocalState = Record<string, never>;
export type CustomContainerPHState = PHBaseState & {
  global: CustomContainerGlobalState;
  local: CustomContainerLocalState;
};

export type SetMetadataInput = {
  name: string;
  description?: string | null;
};
export type SetMetadataAction = Action & {
  type: "SET_METADATA";
  input: SetMetadataInput;
};

// ---------- Initial state ----------

const initialGlobalState: CustomContainerGlobalState = {
  name: "",
  description: null,
};
const initialLocalState: CustomContainerLocalState = {};

// ---------- Action creator ----------

export const setMetadata = (input: SetMetadataInput): SetMetadataAction => ({
  id: generateId(),
  type: "SET_METADATA",
  scope: "global",
  timestampUtcMs: new Date().toISOString(),
  input,
});

export const actions = { setMetadata };

// ---------- Reducer ----------

const stateReducer: StateReducer<CustomContainerPHState> = (state, action) => {
  if (isDocumentAction(action)) return state;
  switch (action.type) {
    case "SET_METADATA": {
      const input = (action as SetMetadataAction).input;
      state.global.name = input.name;
      state.global.description = input.description ?? null;
      break;
    }
    default:
      return state;
  }
};

export const reducer: Reducer<CustomContainerPHState> =
  createReducer(stateReducer);

// ---------- Utils ----------

const createCustomContainerState: CreateState<CustomContainerPHState> = (
  state,
) => ({
  ...defaultBaseState(),
  global: { ...initialGlobalState, ...state?.global },
  local: { ...initialLocalState, ...state?.local },
});

const createCustomContainerDocument = (
  state?: Partial<CustomContainerPHState>,
): PHDocument<CustomContainerPHState> => {
  const document = baseCreateDocument(createCustomContainerState, state);
  document.header.documentType = customContainerDocumentType;
  document.header.id = generateId();
  return document;
};

const isStateOfType = (state: unknown): state is CustomContainerPHState => {
  if (typeof state !== "object" || state === null) return false;
  const s = state as Partial<CustomContainerPHState>;
  return (
    !!s.global &&
    typeof s.global === "object" &&
    "name" in s.global &&
    "description" in s.global
  );
};
function assertIsStateOfType(
  state: unknown,
): asserts state is CustomContainerPHState {
  if (!isStateOfType(state)) {
    throw new Error("State is not a CustomContainerPHState");
  }
}
const isDocumentOfType = (
  document: unknown,
): document is PHDocument<CustomContainerPHState> => {
  return (
    typeof document === "object" &&
    document !== null &&
    (document as PHDocument).header?.documentType ===
      customContainerDocumentType
  );
};
function assertIsDocumentOfType(
  document: unknown,
): asserts document is PHDocument<CustomContainerPHState> {
  if (!isDocumentOfType(document)) {
    throw new Error(
      `Document is not a ${customContainerDocumentType} document`,
    );
  }
}

export const utils: DocumentModelUtils<CustomContainerPHState> = {
  fileExtension: customContainerFileExtension,
  createState: createCustomContainerState,
  createDocument: createCustomContainerDocument,
  saveToFileHandle: (document, input) => baseSaveToFileHandle(document, input),
  loadFromInput: (input) => baseLoadFromInput(input, reducer),
  isStateOfType,
  assertIsStateOfType,
  isDocumentOfType,
  assertIsDocumentOfType,
};

// ---------- Self-describing model metadata ----------

const customContainerModelMeta: DocumentModelGlobalState = {
  id: customContainerDocumentType,
  name: "CustomContainer",
  extension: customContainerFileExtension,
  description:
    "A lightweight container document that tracks children via ADD_RELATIONSHIP " +
    "instead of embedding them in state.",
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type CustomContainerState {\n  name: String!\n  description: String\n}",
          initialValue: JSON.stringify(initialGlobalState),
          examples: [],
        },
        local: { schema: "", initialValue: "{}", examples: [] },
      },
      modules: [
        {
          id: "metadata",
          name: "metadata",
          description: "Container metadata operations",
          operations: [
            {
              id: "set-metadata",
              name: "SET_METADATA",
              description: "Set the container's name and description.",
              schema:
                "input SetMetadataInput {\n  name: String!\n  description: String\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

// ---------- Module ----------

export const customContainerModule: DocumentModelModule<CustomContainerPHState> =
  {
    version: 1,
    reducer,
    actions,
    utils,
    documentModel: createState(defaultBaseState(), customContainerModelMeta),
  };

export const customContainerCreateDocument = createCustomContainerDocument;
