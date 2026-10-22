import {
  resolveHostOutputs,
  TokenResolutionError,
  type OutputSource,
} from "@powerhousedao/host-core";

export { TokenResolutionError };

/** What a running switchboard produced: the values it actually bound. */
export interface SwitchboardOutputs {
  origin: string;
  drives: Record<string, { id: string; url: string }>;
}

/** An `OutputSource` over canned outputs, keyed by host name. In `ph run` the
 * source is a live compound member or the host's run record. */
export function cannedOutputs(
  outputs: Record<string, unknown>,
): OutputSource {
  return {
    lookup: (ref) =>
      ref.host in outputs
        ? { status: "available", outputs: outputs[ref.host] }
        : {
            status: "unavailable",
            message: `needs outputs from host "${ref.host}", which is not running.`,
          },
  };
}

/** Replaces every token in `host` with its value. */
export function resolveHost<T>(
  host: T,
  outputs: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
): T {
  return resolveHostOutputs(host, {
    outputs: cannedOutputs(outputs),
    env,
    where: "hosts/connect/host.js",
  });
}
