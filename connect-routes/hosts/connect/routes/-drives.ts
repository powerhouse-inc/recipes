import {
  waitForArrival,
  type DriveArrivals,
  type PHStore,
} from "@powerhousedao/reactor-browser";

// Starts with "-", so it is shared code, not a route.

/** Connect's drives for a loader. On a cold load they are still arriving, so
 * this waits for the first one, or for the arrivals to settle when there are
 * none, instead of returning an empty list. */
export async function loadDrives(
  context: { store: PHStore; arrivals?: DriveArrivals },
  signal: AbortSignal,
): Promise<NonNullable<PHStore["drives"]>> {
  const { store, arrivals } = context;
  const drives = await waitForArrival(
    () => (store.drives?.length ? store.drives : undefined),
    arrivals,
    signal,
  );
  return drives ?? [];
}
