import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/payment",
  name: "Payment",
  extension: "payment",
  description:
    "Minimal order-payment state machine advanced by verified inbound webhooks",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type PaymentState {\n  orderId: String!\n  amountCents: Int!\n  currency: String!\n  status: PaymentStatus!\n  failureReason: String\n  processedEventIds: [String!]!\n}\n\nenum PaymentStatus {\n  PENDING\n  PAID\n  FAILED\n  REFUNDED\n}",
          initialValue:
            '{"orderId":"","amountCents":0,"currency":"usd","status":"PENDING","failureReason":null,"processedEventIds":[]}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "c3d4e5f6-2222-4b3c-9d4e-000000000001",
          name: "payment",
          description: "Webhook-driven payment lifecycle operations.",
          operations: [
            {
              id: "c3d4e5f6-2222-4b3c-9d4e-000000000010",
              name: "RECORD_PAYMENT",
              description: "Mark a pending payment as paid (PENDING -> PAID).",
              schema:
                "input RecordPaymentInput {\n  eventId: String!\n  amountCents: Int!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already processed`);\n}\nif (state.status !== "PENDING") {\n  throw new InvalidTransition(`recordPayment requires status PENDING, but payment is ${state.status}`);\n}\nstate.status = "PAID";\nstate.amountCents = action.input.amountCents;\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already processed",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "Payment is not PENDING",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "c3d4e5f6-2222-4b3c-9d4e-000000000011",
              name: "MARK_FAILED",
              description:
                "Mark a pending payment as failed (PENDING -> FAILED).",
              schema:
                "input MarkFailedInput {\n  eventId: String!\n  reason: String!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already processed`);\n}\nif (state.status !== "PENDING") {\n  throw new InvalidTransition(`markFailed requires status PENDING, but payment is ${state.status}`);\n}\nstate.status = "FAILED";\nstate.failureReason = action.input.reason;\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already processed",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "Payment is not PENDING",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "c3d4e5f6-2222-4b3c-9d4e-000000000012",
              name: "RECORD_REFUND",
              description: "Refund a paid payment (PAID -> REFUNDED).",
              schema:
                "input RecordRefundInput {\n  eventId: String!\n  amountCents: Int!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already processed`);\n}\nif (state.status !== "PAID") {\n  throw new InvalidTransition(`recordRefund requires status PAID, but payment is ${state.status}`);\n}\nstate.status = "REFUNDED";\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already processed",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "Payment is not PAID",
                  template: "",
                },
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
