import type {
  Action,
  DocumentModelGlobalState,
  DocumentModelModule,
  DocumentModelUtils,
  PHBaseState,
  PHDocument,
  Reducer,
  StateReducer,
} from "document-model";
import {
  baseActions,
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  createAction,
  createReducer,
  createState,
  defaultBaseState,
  generateId,
  isDocumentAction,
} from "document-model";

/**
 * A deliberately small "payment" document model: enough to show a webhook
 * advancing a real state machine, not a production billing schema.
 *
 * The state machine:
 *
 *     PENDING --recordPayment--> PAID --recordRefund--> REFUNDED
 *        \--markFailed--> FAILED
 *
 * `processedEventIds` is the part that matters for the recipe: every webhook
 * event that mutates this document records its provider event id here. Because
 * it lives in document state (not a processor's memory) the dedup set is
 * rebuilt for free on restart — providers redeliver, and a redelivery must not
 * advance the machine twice.
 */

export const PAYMENT_DOCUMENT_TYPE = "powerhouse/payment";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export type PaymentGlobalState = {
  orderId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  failureReason: string | null;
  processedEventIds: string[];
};

type PaymentLocalState = Record<PropertyKey, never>;

export type PaymentPHState = PHBaseState & {
  global: PaymentGlobalState;
  local: PaymentLocalState;
};

export type PaymentDocument = PHDocument<PaymentPHState>;

export type RecordPaymentInput = { eventId: string; amountCents: number };
export type MarkFailedInput = { eventId: string; reason: string };
export type RecordRefundInput = { eventId: string; amountCents: number };

const initialGlobalState: PaymentGlobalState = {
  orderId: "",
  amountCents: 0,
  currency: "usd",
  status: "PENDING",
  failureReason: null,
  processedEventIds: [],
};

// --- Reducer error codes ----------------------------------------------------

export class DuplicateEventError extends Error {
  code = "DUPLICATE_EVENT" as const;
}

export class InvalidTransitionError extends Error {
  code = "INVALID_TRANSITION" as const;
}

function assertUnseen(state: PaymentGlobalState, eventId: string): void {
  // Defense in depth: even if a duplicate slips past the handler-level check
  // (e.g. two redeliveries racing), the reducer refuses to apply it twice.
  if (state.processedEventIds.includes(eventId)) {
    throw new DuplicateEventError(`event ${eventId} already processed`);
  }
}

function assertStatus(
  state: PaymentGlobalState,
  expected: PaymentStatus,
  op: string,
): void {
  if (state.status !== expected) {
    throw new InvalidTransitionError(
      `${op} requires status ${expected}, but payment is ${state.status}`,
    );
  }
}

// --- Action creators --------------------------------------------------------

export const recordPayment = (input: RecordPaymentInput): Action =>
  createAction("RECORD_PAYMENT", { ...input }, undefined, undefined, "global");

export const markFailed = (input: MarkFailedInput): Action =>
  createAction("MARK_FAILED", { ...input }, undefined, undefined, "global");

export const recordRefund = (input: RecordRefundInput): Action =>
  createAction("RECORD_REFUND", { ...input }, undefined, undefined, "global");

// --- Reducer ----------------------------------------------------------------

const stateReducer: StateReducer<PaymentPHState> = (state, action) => {
  if (isDocumentAction(action)) {
    return state;
  }

  // createReducer wraps this with Immer, so mutating the scope slice is safe.
  const payment = (state as Record<string, unknown>)[
    action.scope
  ] as PaymentGlobalState;
  const input = action.input as Record<string, unknown>;

  switch (action.type) {
    case "RECORD_PAYMENT": {
      assertUnseen(payment, input.eventId as string);
      assertStatus(payment, "PENDING", "recordPayment");
      payment.status = "PAID";
      payment.amountCents = input.amountCents as number;
      payment.processedEventIds.push(input.eventId as string);
      break;
    }

    case "MARK_FAILED": {
      assertUnseen(payment, input.eventId as string);
      assertStatus(payment, "PENDING", "markFailed");
      payment.status = "FAILED";
      payment.failureReason = input.reason as string;
      payment.processedEventIds.push(input.eventId as string);
      break;
    }

    case "RECORD_REFUND": {
      assertUnseen(payment, input.eventId as string);
      assertStatus(payment, "PAID", "recordRefund");
      payment.status = "REFUNDED";
      payment.processedEventIds.push(input.eventId as string);
      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<PaymentPHState> = createReducer(stateReducer);

// --- Utils ------------------------------------------------------------------

export const utils: DocumentModelUtils<PaymentPHState> = {
  fileExtension: "payment",
  createState(state) {
    return {
      ...defaultBaseState(),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...state?.local },
    };
  },
  createDocument(state) {
    const document = baseCreateDocument(utils.createState, state);
    document.header.documentType = PAYMENT_DOCUMENT_TYPE;
    // Not a valid signed document id, but fine for a local/example reactor.
    document.header.id = generateId();
    return document;
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInput(input, reducer);
  },
  isStateOfType(state): state is PaymentPHState {
    const g = (state as Partial<PaymentPHState> | undefined)?.global;
    return (
      !!g && typeof g.orderId === "string" && Array.isArray(g.processedEventIds)
    );
  },
  assertIsStateOfType(state) {
    if (!utils.isStateOfType(state)) {
      throw new Error("State is not a PaymentState");
    }
  },
  isDocumentOfType(document): document is PaymentDocument {
    return (
      (document as PaymentDocument | undefined)?.header?.documentType ===
      PAYMENT_DOCUMENT_TYPE
    );
  },
  assertIsDocumentOfType(document) {
    if (!utils.isDocumentOfType(document)) {
      throw new Error("Document is not a Payment document");
    }
  },
};

/**
 * Creates a fresh PENDING payment document for an order. Wraps
 * {@link utils.createDocument} so callers can pass just the fields they know —
 * the rest of the state machine defaults are filled in.
 */
export function createPaymentDocument(init: {
  orderId: string;
  amountCents: number;
  currency?: string;
}): PaymentDocument {
  return utils.createDocument({
    global: init,
  } as unknown as Partial<PaymentPHState>);
}

// --- Document model spec ----------------------------------------------------

const documentModelSpec: DocumentModelGlobalState = {
  id: PAYMENT_DOCUMENT_TYPE,
  name: "Payment",
  extension: "payment",
  description:
    "Minimal order-payment state machine advanced by verified inbound webhooks",
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type PaymentState {\n  orderId: String!\n  amountCents: Int!\n  currency: String!\n  status: PaymentStatus!\n  failureReason: String\n  processedEventIds: [String!]!\n}\n\nenum PaymentStatus {\n  PENDING\n  PAID\n  FAILED\n  REFUNDED\n}",
          initialValue: JSON.stringify(initialGlobalState),
          examples: [],
        },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: "a1b2c3d4-0000-0000-0000-000000000001",
          name: "payment",
          description: "Webhook-driven payment lifecycle operations.",
          operations: [
            {
              id: "a1b2c3d4-0000-0000-0000-000000000010",
              name: "RECORD_PAYMENT",
              description: "Mark a pending payment as paid (PENDING -> PAID).",
              schema:
                "input RecordPaymentInput {\n  eventId: String!\n  amountCents: Int!\n}",
              template: "",
              reducer: "",
              errors: [
                { id: "duplicate", name: "DuplicateEvent", code: "DUPLICATE_EVENT", description: "Event id already processed", template: "" },
                { id: "transition", name: "InvalidTransition", code: "INVALID_TRANSITION", description: "Payment is not PENDING", template: "" },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "a1b2c3d4-0000-0000-0000-000000000011",
              name: "MARK_FAILED",
              description: "Mark a pending payment as failed (PENDING -> FAILED).",
              schema:
                "input MarkFailedInput {\n  eventId: String!\n  reason: String!\n}",
              template: "",
              reducer: "",
              errors: [
                { id: "duplicate", name: "DuplicateEvent", code: "DUPLICATE_EVENT", description: "Event id already processed", template: "" },
                { id: "transition", name: "InvalidTransition", code: "INVALID_TRANSITION", description: "Payment is not PENDING", template: "" },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "a1b2c3d4-0000-0000-0000-000000000012",
              name: "RECORD_REFUND",
              description: "Refund a paid payment (PAID -> REFUNDED).",
              schema:
                "input RecordRefundInput {\n  eventId: String!\n  amountCents: Int!\n}",
              template: "",
              reducer: "",
              errors: [
                { id: "duplicate", name: "DuplicateEvent", code: "DUPLICATE_EVENT", description: "Event id already processed", template: "" },
                { id: "transition", name: "InvalidTransition", code: "INVALID_TRANSITION", description: "Payment is not PAID", template: "" },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

/** Document model module for the `powerhouse/payment` document type. */
export const paymentModule: DocumentModelModule<PaymentPHState> = {
  version: 1,
  reducer,
  actions: { ...baseActions, recordPayment, markFailed, recordRefund },
  utils,
  documentModel: createState(defaultBaseState(), documentModelSpec),
};
