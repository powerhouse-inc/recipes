import type { SubscriptionSubscriptionOperations } from "document-models/subscription/v1";
import {
  DuplicateEvent,
  InvalidTransition,
} from "../../gen/subscription/error.js";

export const subscriptionSubscriptionOperations: SubscriptionSubscriptionOperations =
  {
    activateOperation(state, action) {
      if (state.processedEventIds.includes(action.input.eventId)) {
        throw new DuplicateEvent(
          `event ${action.input.eventId} already recorded`,
        );
      }
      if (state.status === "CANCELED") {
        throw new InvalidTransition(
          "a canceled subscription cannot be activated again",
        );
      }
      state.customerId = action.input.customerId;
      state.plan = action.input.plan;
      state.seats = action.input.seats;
      state.status = "ACTIVE";
      state.lastFailureReason = null;
      state.processedEventIds.push(action.input.eventId);
    },
    markPastDueOperation(state, action) {
      if (state.processedEventIds.includes(action.input.eventId)) {
        throw new DuplicateEvent(
          `event ${action.input.eventId} already recorded`,
        );
      }
      if (state.status !== "ACTIVE") {
        throw new InvalidTransition(
          `markPastDue requires status ACTIVE, but the subscription is ${state.status}`,
        );
      }
      state.status = "PAST_DUE";
      state.lastFailureReason = action.input.reason;
      state.processedEventIds.push(action.input.eventId);
    },
    cancelOperation(state, action) {
      if (state.processedEventIds.includes(action.input.eventId)) {
        throw new DuplicateEvent(
          `event ${action.input.eventId} already recorded`,
        );
      }
      if (state.status === "CANCELED") {
        throw new InvalidTransition("the subscription is already canceled");
      }
      state.status = "CANCELED";
      state.processedEventIds.push(action.input.eventId);
    },
  };
