import type { PHBaseState, PHDocument, Reducer } from "document-model";
import { replayDocument } from "document-model";

/**
 * Replays a document the way the platform loads one (baseLoadFromInput):
 * start from the stored initialState and run the domain-scope operations
 * through the latest version's reducer. Non-domain scopes ("document",
 * "auth") are never replayed, so the upgrade is not re-run — its effect
 * survives only in the migrated initialState. That is why an upgrade
 * reducer that forgets initialState breaks replay.
 *
 * checkHashes: false because per-operation hash checks cannot pass on a
 * cross-version log — operations recorded before the upgrade hashed
 * v1-shaped states, while replay rebuilds v2-shaped ones. replayDocument
 * still verifies the final state of each scope against the last recorded
 * hash and throws HashMismatchError if the replay diverged.
 */
const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

export function replay<TState extends PHBaseState>(
  document: PHDocument<TState>,
  reducer: Reducer<TState>,
): PHDocument<TState> {
  const domainOps = Object.fromEntries(
    Object.entries(document.operations).filter(
      ([scope]) => !NON_DOMAIN_SCOPES.has(scope),
    ),
  );
  return replayDocument(
    document.initialState,
    domainOps,
    reducer,
    document.header,
    undefined,
    undefined,
    { checkHashes: false },
  );
}
