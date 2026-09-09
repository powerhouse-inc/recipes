import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/subscription",
  name: "Subscription",
  extension: "subscription",
  description:
    "Subscription lifecycle advanced by verified provider webhook deliveries",
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
            "type SubscriptionState {\n  customerId: String!\n  plan: String!\n  seats: Int!\n  status: SubscriptionStatus!\n  lastFailureReason: String\n  processedEventIds: [String!]!\n}\n\nenum SubscriptionStatus {\n  PENDING\n  ACTIVE\n  PAST_DUE\n  CANCELED\n}",
          initialValue:
            '{"customerId":"","plan":"","seats":0,"status":"PENDING","lastFailureReason":null,"processedEventIds":[]}',
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
          id: "b1f0c2d3-3333-4a5b-8c6d-000000000001",
          name: "subscription",
          description:
            "Lifecycle operations dispatched from verified webhook deliveries.",
          operations: [
            {
              id: "b1f0c2d3-3333-4a5b-8c6d-000000000010",
              name: "ACTIVATE",
              description:
                "Record the subscription as active on the given plan and seat count.",
              schema:
                "input ActivateInput {\n  eventId: String!\n  customerId: String!\n  plan: String!\n  seats: Int!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already recorded`);\n}\nif (state.status === "CANCELED") {\n  throw new InvalidTransition("a canceled subscription cannot be activated again");\n}\nstate.customerId = action.input.customerId;\nstate.plan = action.input.plan;\nstate.seats = action.input.seats;\nstate.status = "ACTIVE";\nstate.lastFailureReason = null;\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already recorded on this document",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "The subscription is canceled",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "b1f0c2d3-3333-4a5b-8c6d-000000000011",
              name: "MARK_PAST_DUE",
              description:
                "Record a failed payment attempt (ACTIVE -> PAST_DUE).",
              schema:
                "input MarkPastDueInput {\n  eventId: String!\n  reason: String!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already recorded`);\n}\nif (state.status !== "ACTIVE") {\n  throw new InvalidTransition(`markPastDue requires status ACTIVE, but the subscription is ${state.status}`);\n}\nstate.status = "PAST_DUE";\nstate.lastFailureReason = action.input.reason;\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already recorded on this document",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "The subscription is not ACTIVE",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "b1f0c2d3-3333-4a5b-8c6d-000000000012",
              name: "CANCEL",
              description:
                "Record the subscription as canceled by the provider.",
              schema: "input CancelInput {\n  eventId: String!\n}",
              template: "",
              reducer:
                'if (state.processedEventIds.includes(action.input.eventId)) {\n  throw new DuplicateEvent(`event ${action.input.eventId} already recorded`);\n}\nif (state.status === "CANCELED") {\n  throw new InvalidTransition("the subscription is already canceled");\n}\nstate.status = "CANCELED";\nstate.processedEventIds.push(action.input.eventId);',
              errors: [
                {
                  id: "duplicateEvent",
                  name: "DuplicateEvent",
                  code: "DUPLICATE_EVENT",
                  description: "Event id already recorded on this document",
                  template: "",
                },
                {
                  id: "invalidTransition",
                  name: "InvalidTransition",
                  code: "INVALID_TRANSITION",
                  description: "The subscription is already canceled",
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
