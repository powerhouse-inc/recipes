import type { EditorProps } from "document-model";
import { generateId } from "document-model";
import type { TodoAction, TodoDocument } from "document-models/todo/v1";
import { actions } from "document-models/todo/v1";
import { useState } from "react";

/**
 * The host passes `document` and `dispatch`. Both are typed for the Todo
 * document model, so `document.state.global.items` and `actions.addItem` are
 * checked, and no `useSelectedTodoDocument()` hook is involved.
 */
export default function Editor({
  document,
  dispatch,
}: EditorProps<TodoDocument, TodoAction>) {
  const [title, setTitle] = useState("");

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    dispatch(actions.addItem({ id: generateId(), title: trimmed }));
    setTitle("");
  };

  return (
    <div>
      <ul>
        {document.state.global.items.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) =>
                  dispatch(
                    actions.checkItem({
                      id: item.id,
                      checked: e.target.checked,
                    }),
                  )
                }
              />
              {item.title}
            </label>
          </li>
        ))}
      </ul>
      <input
        aria-label="New item"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="button" onClick={handleAdd}>
        Add
      </button>
    </div>
  );
}
