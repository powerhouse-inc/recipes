import {
  JobAwaiter,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
  setName,
} from "document-model";
import {
  driveCreateDocument,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import { DeliveryRecorder, type Delivery } from "./recorder.js";

export const MODES = ["latest", "collapse", "exact", "operations"] as const;
export type Mode = (typeof MODES)[number];

export type ScenarioResult = {
  /** Deliveries each mode saw when it replayed the history from the start. */
  replay: Record<Mode, Delivery[]>;
  /** The delivery a processor saw for an operation applied after it caught up. */
  live: Delivery;
};

const NAMES = ["Draft", "Review", "Final"];

/**
 * Applies three renames to one document, then registers one processor per
 * `replayState` mode with `startFrom: "beginning"`, so each replays the same
 * history. A fourth rename is applied once they have caught up and shows what
 * a live delivery carries.
 */
export async function runScenario(): Promise<ScenarioResult> {
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "replay-state",
  );
  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
        driveDocumentModelModule,
      ]),
    )
    .withSigner(signer)
    .buildModule();
  const { client } = clientModule;
  const { reactor, eventBus, processorManager } = clientModule.reactorModule!;

  const awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
  const settle = async (jobId: string) => {
    const job = await awaiter.waitForJob(jobId);
    if (job.status === JobStatus.FAILED) {
      throw new Error(`job ${jobId} failed: ${job.error?.message}`);
    }
  };

  try {
    // A processor factory runs once per drive, so a drive has to exist.
    await settle((await reactor.create(driveCreateDocument(), signer)).id);
    const doc = documentModelCreateDocument();
    await settle((await reactor.create(doc, signer)).id);
    for (const name of NAMES) {
      const job = await client.executeAsync(doc.header.id, "main", [
        setName(name),
      ]);
      await settle(job.id);
    }

    const recorders = {} as Record<Mode, DeliveryRecorder>;
    for (const mode of MODES) {
      const processor = new DeliveryRecorder();
      recorders[mode] = processor;
      await processorManager.registerFactory(`replay-${mode}`, () => [
        {
          processor,
          filter: {
            branch: ["main"],
            documentType: ["powerhouse/document-model"],
          },
          startFrom: "beginning" as const,
          replayState: mode,
        },
      ]);
    }
    await until(() => MODES.every((m) => recorders[m].deliveries.length > 0));
    await settleQuiet();

    const replay = Object.fromEntries(
      MODES.map((m) => [m, [...recorders[m].deliveries]]),
    ) as Record<Mode, Delivery[]>;

    const before = recorders.latest.deliveries.length;
    const liveJob = await client.executeAsync(doc.header.id, "main", [
      setName("Published"),
    ]);
    await settle(liveJob.id);
    await until(() => recorders.latest.deliveries.length > before);
    const live = recorders.latest.deliveries[before]!;

    return { replay, live };
  } finally {
    awaiter.shutdown();
    reactor.kill();
  }
}

async function until(done: () => boolean, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise<void>((r) => setTimeout(r, 50));
  }
}

/** Gives a mode that delivers several operations time to deliver all of them. */
const settleQuiet = () => new Promise<void>((r) => setTimeout(r, 1000));
