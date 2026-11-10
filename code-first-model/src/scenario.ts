import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/node";
import {
  defineDocumentModel,
  materialize,
  type DocumentOf,
  type GlobalStateOf,
  type LocalStateOf,
} from "document-model";
import { Checklist } from "./checklist/index.js";
import { checklistConfig, ChecklistState } from "./checklist/definition.js";

export type ScenarioResult = {
  documentType: string;
  global: GlobalStateOf<typeof Checklist>;
  /** `{}`: the model declares no local scope. */
  local: LocalStateOf<typeof Checklist>;
  /** The stored specification's local scope, as a host reads it. */
  storedLocal: { schema: string; initialValue: string };
  /** Whether the checklist stores the same state specification as a twin that spells out the empty local scope. */
  matchesExplicitLocal: boolean;
};

/**
 * The same model with `local: { schema: null, initialValue: {} }` written
 * out, the form every code-first model needed before local became optional.
 */
function explicitLocalTwin() {
  return defineDocumentModel({
    ...checklistConfig,
    scopes: {
      global: { schema: ChecklistState, initialValue: { items: [] } },
      local: { schema: null, initialValue: {} },
    },
  });
}

/**
 * Registers the checklist with an in-process reactor, adds two items and
 * ticks one off, then reads back the document and its stored specification.
 */
export async function runScenario(): Promise<ScenarioResult> {
  const signer = new RenownCryptoSigner(
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build(),
    "code-first-model",
  );
  const { client, reactorModule } = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([Checklist]),
    )
    .withSigner(signer)
    .buildModule();

  try {
    const created = await client.write.createEmpty(checklistConfig.id);
    const { documentId } = await created.readable;

    const { addItem, setItemDone } = Checklist.actions;
    const handle = await client.write.execute(documentId, "main", [
      addItem({ id: "milk", label: "Buy milk" }),
      addItem({ id: "post", label: "Post the letter" }),
      setItemDone({ id: "milk", done: true }),
    ]);
    const document = (await handle.document()) as DocumentOf<typeof Checklist>;

    const [spec] = Checklist.documentModel.global.specifications;
    const twin = materialize(explicitLocalTwin().version({ modules: [] }));
    const [twinSpec] = twin.documentModel.global.specifications;

    return {
      documentType: document.header.documentType,
      global: document.state.global,
      local: document.state.local,
      storedLocal: {
        schema: spec!.state.local.schema,
        initialValue: spec!.state.local.initialValue,
      },
      matchesExplicitLocal:
        JSON.stringify(spec!.state) === JSON.stringify(twinSpec!.state),
    };
  } finally {
    reactorModule?.reactor.kill();
  }
}
