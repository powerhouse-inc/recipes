# Editor props

An editor that receives its document and `dispatch` as props, typed for its
document model. Hosts (Connect, Vetra, drive apps) pass both props, so the
editor does not call `useSelected<Model>Document()`.

## The pattern

[`editors/todo-editor/editor.tsx`](./editors/todo-editor/editor.tsx):

```tsx
export default function Editor({
  document,
  dispatch,
}: EditorProps<TodoDocument, TodoAction>) {
  dispatch(actions.addItem({ id, title }));
  // document.state.global.items is typed
}
```

- `EditorProps<TDocument, TAction>` makes `document` and `dispatch` required and
  typed. Bare `EditorProps` keeps them optional, so existing editors compile
  unchanged.
- [`module.ts`](./editors/todo-editor/module.ts) types the module as
  `EditorModule<TodoDocument, TodoAction>`. A module typed for one document
  rejects an editor typed for another.
- Generated editors from `ph init` follow this shape. The `ph init` oxlint
  config warns on `useSelected*Document` hooks in `editors/`.

## Requirements

Needs Powerhouse 6.2.3-dev.70 or later, the first release with
[powerhouse#3261](https://github.com/powerhouse-inc/powerhouse/pull/3261). The
workspace catalog pins 6.2.3-dev.79.
Editors written this way need a Connect with the same change.

## Run

```sh
pnpm install
pnpm --filter @powerhousedao/example-editor-props test
```

The tests render the editor with a document and a mock `dispatch`, check the
dispatched actions, and check with `@ts-expect-error` that `dispatch` is
required.
