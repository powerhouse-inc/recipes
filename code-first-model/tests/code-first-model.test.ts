import {
  DefinitionError,
  defineDocumentModel,
  materialize,
  type LocalStateOf,
} from "document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { Checklist } from "../src/checklist/index.js";
import {
  checklistConfig,
  ChecklistState,
} from "../src/checklist/definition.js";
import { runScenario } from "../src/scenario.js";

const { actions, reducer, utils } = Checklist;

describe("a code-first model without a local scope", () => {
  it("creates documents whose local state is empty", () => {
    const document = utils.createDocument();
    expect(document.header.documentType).toBe("recipes/checklist");
    expect(document.state.global).toStrictEqual({ items: [] });
    expect(document.state.local).toStrictEqual({});
  });

  it("types the local state as an empty record", () => {
    expectTypeOf<LocalStateOf<typeof Checklist>>().toEqualTypeOf<
      Record<string, never>
    >();
  });

  it("stores the same state specification as the explicit empty form", () => {
    const explicit = materialize(
      defineDocumentModel({
        ...checklistConfig,
        scopes: {
          global: { schema: ChecklistState, initialValue: { items: [] } },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] }),
    );
    const [omitted] = Checklist.documentModel.global.specifications;
    const [spelled] = explicit.documentModel.global.specifications;
    expect(omitted!.state).toStrictEqual(spelled!.state);
    expect(omitted!.state.local).toMatchObject({
      schema: "",
      initialValue: "{}",
    });
  });

  it("reduces its operations as a generated model would", () => {
    let document = reducer(
      utils.createDocument(),
      actions.addItem({ id: "milk", label: "Buy milk" }),
    );
    document = reducer(document, actions.setItemDone({ id: "milk", done: true }));
    expect(document.state.global.items).toStrictEqual([
      { id: "milk", label: "Buy milk", done: true },
    ]);
  });

  it("still refuses a model without a global scope", () => {
    let caught: unknown;
    try {
      defineDocumentModel({
        ...checklistConfig,
        // @ts-expect-error global is required; only local can be omitted
        scopes: {},
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DefinitionError);
    expect((caught as DefinitionError).diagnostics).toMatchObject([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["scopes", "global"],
        received: "absent",
      },
    ]);
  });
});

describe("the checklist in a reactor", () => {
  it("runs operations and keeps the local state empty", async () => {
    const result = await runScenario();
    expect(result.documentType).toBe("recipes/checklist");
    expect(result.global.items).toStrictEqual([
      { id: "milk", label: "Buy milk", done: true },
      { id: "post", label: "Post the letter", done: false },
    ]);
    expect(result.local).toStrictEqual({});
    expect(result.matchesExplicitLocal).toBe(true);
  });
});
