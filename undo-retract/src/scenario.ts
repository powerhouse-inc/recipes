import {
  JobAwaiter,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type {
  DocumentModelDocument,
  Operation,
} from "@powerhousedao/shared/document-model";
import {
  documentModelDocumentModelModule,
  addModule,
} from "document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";

export type Step = {
  label: string;
  /** The ids of the document's modules after the step. */
  modules: string[];
  canUndo: boolean;
  canRedo: boolean;
  /** The action id `undo` would retract now. */
  undoTarget?: string;
  /** The action id `redo` would retract now. */
  redoTarget?: string;
};

export type ScenarioResult = {
  baseReducer: number | undefined;
  steps: Step[];
  /** The global stream at the end: edits and the RETRACTs that undid them. */
  operations: Operation[];
  /** Action ids of the two ADD_MODULE edits, in order. */
  editIds: string[];
  /** `did` of the signer that submitted every operation. */
  signerKey: string;
};

/**
 * Adds two modules to one document, then undoes, redoes and undoes again through
 * `client.undo` and `client.redo`. `undoV3` is on by default, so the document
 * is created at base-reducer 3 and each undo or redo is stored as a `RETRACT`.
 */
export async function runScenario(): Promise<ScenarioResult> {
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "undo-retract",
  );
  const clientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule])
        .withExecutorConfig({ featureFlags: { undoV3: true } }),
    )
    .withSigner(signer)
    .buildModule();
  const { client } = clientModule;
  const { reactor, eventBus } = clientModule.reactorModule!;

  const awaiter = new JobAwaiter(eventBus, (jobId, signal) =>
    reactor.getJobStatus(jobId, signal),
  );
  const settle = async (jobId: string) => {
    const job = await awaiter.waitForJob(jobId);
    if (job.status === JobStatus.FAILED) {
      throw new Error(`job ${jobId} failed: ${job.error?.message}`);
    }
  };
  const stream = async (id: string): Promise<Operation[]> => {
    const page = await reactor.getOperations(id, {
      branch: "main",
      scopes: ["global"],
    });
    return page["global"]?.results ?? [];
  };

  try {
    // createEmpty builds the header from the reactor's flags, so it is
    // base-reducer 3. A document built with documentModelCreateDocument()
    // carries its own header and stays at base-reducer 2.
    const created = await client.write.createEmpty("powerhouse/document-model");
    await created.written;
    const id = created.documentId;
    const baseReducer = (await reactor.get(id)).header.protocolVersions?.[
      "base-reducer"
    ];

    const steps: Step[] = [];
    const record = async (label: string) => {
      const [document, availability, targets] = await Promise.all([
        client.get<DocumentModelDocument>(id),
        client.undoRedoAvailability(id),
        client.undoRedoTargets(id),
      ]);
      steps.push({
        label,
        modules: document.state.global.specifications[0].modules.map((m) => m.id),
        ...availability,
        undoTarget: targets.undoTarget,
        redoTarget: targets.redoTarget,
      });
    };

    for (const moduleId of ["a", "b"]) {
      await client.execute(id, "main", [
        addModule({ id: moduleId, name: moduleId }),
      ]);
    }
    await record('added modules "a" and "b"');

    await client.undo(id);
    await record("undo");

    await client.redo(id);
    await record("redo");

    await client.undo(id);
    await record("undo");

    const operations = await stream(id);
    return {
      baseReducer,
      steps,
      operations,
      editIds: operations
        .filter((o) => o.action.type === "ADD_MODULE")
        .map((o) => o.action.id),
      signerKey: operations[0]?.action.context?.signer?.app.key ?? "",
    };
  } finally {
    reactor.kill();
  }
}
