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
export function cannedOutputs(outputs: Record<string, unknown>): OutputSource {
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

/** Replaces every token in `host` with its value. `R` is the resolved shape:
 * the declared host types its token fields as objects, the result has strings. */
export function resolveHost<R>(
  host: unknown,
  outputs: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
  where = "host.js",
): R {
  return resolveHostOutputs(host, {
    outputs: cannedOutputs(outputs),
    env,
    where,
  }) as R;
}

/** The part of the Connect host the examples read after resolving. */
export interface ResolvedDrives {
  reactor: { drives: { slug: string; remote: { url: string } }[] };
}

/** What a running switchboard on `port` produces. */
export function switchboardOutputs(port: number): SwitchboardOutputs {
  const origin = `http://localhost:${port}`;
  return {
    origin,
    drives: { sektar: { id: "sektar", url: `${origin}/d/sektar` } },
  };
}
