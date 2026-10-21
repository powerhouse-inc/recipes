import {
  waitForArrival,
  type DriveArrivals,
  type PHStore,
} from "@powerhousedao/reactor-browser";

// Starts with "-", so it is shared code, not a route.

/** Connect's drives for a loader. On a cold load they are still arriving, so
 * this waits until nothing is pending (no drive still being added, no remote
 * on its first sync) instead of returning the first drives to arrive. If the
 * wait hits its cap, it returns the drives listed so far. */
export async function loadDrives(
  context: { store: PHStore; arrivals?: DriveArrivals },
  signal: AbortSignal,
): Promise<NonNullable<PHStore["drives"]>> {
  const { store, arrivals } = context;
  const drives = await waitForArrival(
    () => (arrivals?.isPending() ? undefined : store.drives),
    arrivals,
    signal,
  );
  return drives ?? store.drives ?? [];
}
