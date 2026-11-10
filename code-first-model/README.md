# Code-first model without local state

A document model declared in TypeScript with `defineDocumentModel` and `ph`, with no generated files and no `local` scope. Leaving `scopes.local` out means `local: { schema: null, initialValue: {} }`: documents get `{}` as their local state, `LocalStateOf` is `Record<string, never>`, and the stored specification is the same one the explicit form produces. `global` is still required.

## How it works

`src/checklist/definition.ts` declares the model. `scopes` has one entry:

```ts
export const checklistModel = defineDocumentModel({
  id: "recipes/checklist",
  name: "Checklist",
  // ...
  version: 1,
  scopes: {
    global: { schema: ChecklistState, initialValue: { items: [] } },
  },
});
```

`src/checklist/modules/items.ts` declares the `addItem` and `setItemDone` operations on it, each with its input and errors. `src/checklist/index.ts` puts that version in a family with `defineDocumentModelFamily` and calls `materialize`, which returns a `DocumentModelModule` with `reducer`, `actions`, `utils` and the stored `documentModel`.

The demo registers that module with an in-process reactor through `withDocumentModelSources([Checklist])`, adds two items, ticks one off, and reads the document back:

```
document type     recipes/checklist
global state      {"items":[{"id":"milk","done":true,"label":"Buy milk"},{"id":"post","done":false,"label":"Post the letter"}]}
local state       {}
stored local      schema "", initialValue "{}"
same definition as explicit { schema: null, initialValue: {} }: true
```

The last line compares the checklist's stored state specification with that of a twin model that writes `local: { schema: null, initialValue: {} }` out.

## Gotchas

- **Only `local` can be left out.** A model without `global` fails `defineDocumentModel` with a `DefinitionError` whose diagnostic is `PH-DM-DECLARATION-INVALID` at `scopes.global`, with a repair that names the schema to add. TypeScript reports it first, because `scopes.global` is a required property.
- **The explicit form still works.** `local: { schema: null, initialValue: {} }` typechecks and stores the same specification, so existing models need no change. A `local` chosen at runtime between a declared scope and the empty form also typechecks.
- **Explicit type arguments keep their order.** `defineDocumentModel<typeof State, null, 1>(...)` declares a model without local state and can omit `local`.
- **An omitted local is not writable.** Its state type is `Record<string, never>`, so `{ note: null }` is a type error. Add a `local` scope with a schema to keep per-user state.

## Running

```bash
pnpm install   # at the repo root
pnpm start     # prints the output above
pnpm test      # vitest: the model on its own, then in an in-process reactor
```

## Requirements

| Requirement | Why |
|-------------|-----|
| `document-model` and `@powerhousedao/reactor` 6.2.3-dev.102 or a later dev build | The first build where `scopes.local` is optional (powerhouse#3395). On dev.101 `scopes.local` is required, so the model above fails to typecheck. The recipe pins dev.102 itself; the catalog stays on dev.79 |
| Node 24 or later | The published reactor calls `Error.isError`, which Node 22 does not have |

## Architecture

| Module | Purpose |
|--------|---------|
| `src/checklist/definition.ts` | Declares the model and its state types, with `global` only |
| `src/checklist/modules/items.ts` | Declares the `addItem` and `setItemDone` operations and their errors |
| `src/checklist/index.ts` | Materializes the family and exports `Checklist`, the version 1 module |
| `src/scenario.ts` | Runs the checklist in an in-process reactor and compares it with the explicit-local twin |
| `src/demo.ts` | Prints the scenario |
| `tests/code-first-model.test.ts` | Asserts the empty local state and its type, the stored specification, the reducer, the missing-global diagnostic and the reactor run |
