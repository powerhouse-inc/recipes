/**
 * Deletion as a position, not a tombstone. Two reactors hold the same
 * field log. Station B keeps logging while Station A deletes the
 * document — a plain split-brain, no clock tricks. After syncing both
 * directions, both reactors agree, per operation:
 *
 *   - an observation that sorts BEFORE the delete is legitimate history
 *   - an observation that sorts AFTER it is stored as a denied
 *     operation (deniedReason = "document deleted"), not dropped
 *   - the document view serves the state as of the deletion
 *
 * Everything here runs with the documentDecisions feature flag on, which
 * replaces the whole-document deleted check with per-operation verdicts
 * at each operation's position in the merged order.
 */
import {
  JobStatus,
  ReactorBuilder,
  type IReactor,
  type JobInfo,
} from "@powerhousedao/reactor";
import {
  garbageCollect,
  isDenied,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import type { Action, ILogger, Operation } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import {
  FieldLog,
  logObservation,
  utils,
  type FieldLogDocument,
} from "document-models/field-log/v1";

const STATION_A = "0xAAaAAaAaAAAAaaaAaAAaaAaAAAaAaAaAAAAAaAA0";
const STATION_B = "0xBBBbbbBBbBbBBBBbbBBbbbbbBBbbBBbbBbbBbBB1";

function label(address: string): string {
  return address === STATION_A ? "Station A" : "Station B";
}

function signedBy<A extends Action>(action: A, address: string): A {
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address, networkId: "eip155", chainId: 1 },
        app: { name: "positional-delete-demo", key: `did:demo:${address}` },
        signatures: [],
      },
    },
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Refusals are the point of this demo; keep the reactor's error channel quiet. */
function quietLogger(): ILogger {
  const drop = () => {};
  return {
    level: "error",
    errorHandler: drop,
    child: () => quietLogger(),
    verbose: drop,
    debug: drop,
    info: drop,
    warn: drop,
    error: drop,
  };
}

async function buildReactor(): Promise<IReactor> {
  return new ReactorBuilder()
    .withDocumentModelSources([FieldLog, documentModelDocumentModelModule])
    .withLogger(quietLogger())
    .withExecutorConfig({
      featureFlags: { documentDecisions: true },
    })
    .build();
}

async function waitForJob(reactor: IReactor, job: JobInfo): Promise<JobInfo> {
  for (;;) {
    const status = await reactor.getJobStatus(job.id);
    if (
      status.status === JobStatus.READ_READY ||
      status.status === JobStatus.FAILED
    ) {
      return status;
    }
    await sleep(10);
  }
}

async function log(
  reactor: IReactor,
  docId: string,
  station: string,
  id: string,
  note: string,
): Promise<void> {
  await sleep(15); // give every operation its own millisecond
  const job = await reactor.execute(docId, "main", [
    signedBy(logObservation({ id, note }), station),
  ]);
  const done = await waitForJob(reactor, job);
  if (done.status === JobStatus.FAILED) {
    console.log(`[${label(station)}] log "${note}"`);
    console.log(`        → refused: ${done.error?.message ?? "job failed"}`);
  } else {
    console.log(`[${label(station)}] log "${note}" → ok`);
  }
}

/** Copies one scope's operations from one reactor to the other. */
async function sync(
  from: IReactor,
  to: IReactor,
  docId: string,
  scope: string,
): Promise<void> {
  const ops = await from.getOperations(docId, {
    branch: "main",
    scopes: [scope],
  });
  const results = ops[scope]?.results ?? [];
  if (results.length === 0) return;
  await waitForJob(to, await to.load(docId, "main", results));
}

/**
 * The operations that still count, in merged order. A re-evaluation
 * re-appends with a skip rather than rewriting, so the raw rows hold
 * both copies; garbage collection resolves to the effective set.
 */
async function effectiveObservations(
  reactor: IReactor,
  docId: string,
): Promise<Array<{ note: string; verdict: string }>> {
  const ops = await reactor.getOperations(docId, {
    branch: "main",
    scopes: ["global"],
  });
  const effective = garbageCollect(
    sortOperations([...(ops.global?.results ?? [])] as Operation[]),
  );
  return effective.map((operation) => ({
    note: (operation.action.input as { note: string }).note,
    verdict: isDenied(operation)
      ? `DENIED (${operation.deniedReason})`
      : "applied",
  }));
}

async function main() {
  console.log("positional-delete: deletion as a position");
  console.log("═══════════════════════════════════════════\n");

  process.stdout.write("Starting two reactors (documentDecisions on)...");
  const reactorA = await buildReactor();
  const reactorB = await buildReactor();
  console.log(" done\n");

  // Station A creates the log and records the first observation.
  const document = utils.createDocument();
  const docId = document.header.id;
  await waitForJob(reactorA, await reactorA.create(document));
  await log(reactorA, docId, STATION_A, "obs-wind", "wind 12 kn");

  // Station B receives the document and its history.
  await sync(reactorA, reactorB, docId, "document");
  await sync(reactorA, reactorB, docId, "global");
  console.log("        (synced to Station B)\n");

  // The stations now work independently — B never stops logging.
  await log(reactorB, docId, STATION_B, "obs-temp", "temp 18 °C");

  await sleep(15);
  await waitForJob(reactorA, await reactorA.deleteDocument(docId));
  console.log("[Station A] deleteDocument → ok (B doesn't know yet)");

  await log(reactorB, docId, STATION_B, "obs-humidity", "humidity 80 %");
  console.log();

  // Sync both directions. Each reactor judges every operation at its
  // position in the merged order: temp sorts before the delete, humidity
  // after it.
  console.log("Syncing A → B (the delete arrives at B)...");
  await sync(reactorA, reactorB, docId, "document");
  console.log("Syncing B → A (B's observations arrive at A)...");
  await sync(reactorB, reactorA, docId, "global");
  console.log();

  for (const [name, reactor] of [
    ["Station A", reactorA],
    ["Station B", reactorB],
  ] as const) {
    console.log(`=== effective operations on ${name} ===`);
    for (const { note, verdict } of await effectiveObservations(
      reactor,
      docId,
    )) {
      console.log(`  "${note}" → ${verdict}`);
    }
  }

  // A write submitted after the delete is known fails at origin — nothing
  // is stored at all.
  console.log();
  await log(reactorB, docId, STATION_B, "obs-late", "pressure 1013 hPa");

  // The view serves the document as of the deletion boundary rather than
  // hiding it: legitimate history stays readable.
  const asOfDeletion = await reactorA.get<FieldLogDocument>(docId);
  console.log("\n=== state served as of the deletion (Station A) ===");
  console.log(JSON.stringify(asOfDeletion.state.global, null, 2));

  reactorA.kill();
  reactorB.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
