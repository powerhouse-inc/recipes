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
      // PAST_DUE too: Stripe sends a payment_failed for every failed retry,
      // and refusing the second one would drop it for good. A repeat keeps
      // the status and records the latest reason.
      if (state.status !== "ACTIVE" && state.status !== "PAST_DUE") {
        throw new InvalidTransition(
          `markPastDue requires status ACTIVE or PAST_DUE, but the subscription is ${state.status}`,
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
      // Nothing to cancel before an activation. This also keeps a PENDING
      // document, which has no customer to match events against yet, from
      // being ended by another customer's deletion.
      if (state.status === "PENDING") {
        throw new InvalidTransition(
          "a subscription that was never activated cannot be canceled",
        );
      }
      state.status = "CANCELED";
      state.processedEventIds.push(action.input.eventId);
    },
  };
