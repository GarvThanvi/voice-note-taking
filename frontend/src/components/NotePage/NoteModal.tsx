import { useState, useEffect, useRef } from "react";
import { X, Trash2, CheckSquare, AlignLeft, Archive, GripVertical } from "lucide-react";
import { AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { createNote, updateNote, deleteNote, toggleTodoComplete } from "../../api/noteApi";
import { useDebouncedCallback } from "../../hooks/useDebounce";
import type { Note } from "../../api/noteApi";

interface NoteModalProps {
  isOpen: boolean;
  note: Note | null;
  onClose: () => void;
  onNoteCreated: (note: Note) => void;
  onNoteUpdated: (note: Note) => void;
  onNoteDeleted: (noteId: number) => void;
  onArchive?: (noteId: number) => void;
}

type TodoDraft = { key: string; text: string; done: boolean; id?: number };

interface NoteDraft {
  title: string;
  content: string;
  noteType: "PARAGRAPH" | "CHECKBOX";
  todos: TodoDraft[];
}

const toDraft = (note: Note | null): NoteDraft => ({
  title: note?.title || "",
  content: note?.type === "PARAGRAPH" ? (note?.content || "") : "",
  noteType: note?.type || "PARAGRAPH",
  todos:
    note?.type === "CHECKBOX"
      ? (note.todos?.map((t) => ({ key: `id:${t.id}`, text: t.text, done: t.done, id: t.id })) || [])
      : [],
});

interface TodoRowProps {
  todo: TodoDraft;
  index: number;
  showRemove: boolean;
  canToggle: boolean;
  onToggle: (index: number) => void;
  onTextChange: (index: number, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
  onRemove: (index: number) => void;
}

const TodoRow = ({ todo, index, showRemove, canToggle, onToggle, onTextChange, onKeyDown, onRemove }: TodoRowProps) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={todo.key}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 550, damping: 42 }}
      whileDrag={{ scale: 1.02, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
      className="flex items-center gap-3 group bg-background rounded-md"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="shrink-0 -ml-1 p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-surface cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>

      <button
        type="button"
        onClick={() => canToggle && onToggle(index)}
        className={`
          flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
          ${todo.done
            ? "bg-primary border-primary text-white"
            : "border-border hover:border-primary/50"
          }
        `}
      >
        {todo.done && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <input
        type="text"
        value={todo.text}
        onChange={(e) => onTextChange(index, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, index)}
        placeholder="New item"
        className={`flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground ${
          todo.done ? "line-through text-muted-foreground" : ""
        }`}
      />

      {showRemove && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all"
        >
          <X size={14} />
        </button>
      )}
    </Reorder.Item>
  );
};

const NoteModal = ({ isOpen, note, onClose, onNoteCreated, onNoteUpdated, onNoteDeleted, onArchive }: NoteModalProps) => {
  const isEdit = !!note;
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.type === "PARAGRAPH" ? (note?.content || "") : "");
  const [noteType, setNoteType] = useState<"PARAGRAPH" | "CHECKBOX">(note?.type || "PARAGRAPH");
  const [todos, setTodos] = useState<TodoDraft[]>(toDraft(note).todos);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const todosDirtyRef = useRef(0);
  const draftRef = useRef<NoteDraft>(toDraft(note));
  const newKeyRef = useRef(0);

  const makeKey = () => `new:${++newKeyRef.current}`;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (note) {
      const next = toDraft(note);
      setTitle(next.title);
      setContent(next.content);
      setNoteType(next.noteType);
      setTodos(next.todos);
      draftRef.current = next;
    }
  }, [note]);

  const runSave = async () => {
    if (!note) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }

    savingRef.current = true;
    pendingRef.current = false;
    setSaving(true);
    const todosDirtyAtSave = todosDirtyRef.current;

    try {
      do {
        pendingRef.current = false;
        const draft = draftRef.current;

        const payload =
          draft.noteType === "CHECKBOX"
            ? {
                title: draft.title,
                type: draft.noteType,
                todos: draft.todos.map((td) => ({ id: td.id, text: td.text, done: td.done })),
                content: "",
              }
            : { title: draft.title, type: draft.noteType, content: draft.content, todos: [] };

        const updated = await updateNote(note.id, payload);

        if (
          draft.noteType === "CHECKBOX" &&
          updated.todos &&
          todosDirtyRef.current === todosDirtyAtSave
        ) {
          const serverTodos = updated.todos.map((td, i) => ({
            key: draft.todos[i]?.key ?? `id:${td.id}`,
            id: td.id,
            text: td.text,
            done: td.done,
          }));
          setTodos(serverTodos);
          draftRef.current = { ...draftRef.current, todos: serverTodos };
        }

        onNoteUpdated(updated);
      } while (pendingRef.current);
    } catch {
      // silent
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const debouncedSave = useDebouncedCallback(runSave, 400);

  const handleClose = () => {
    debouncedSave.flush();
    onClose();
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    draftRef.current = { ...draftRef.current, title: value };
    if (isEdit) {
      debouncedSave.run();
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    draftRef.current = { ...draftRef.current, content: value };
    if (isEdit && noteType === "PARAGRAPH") {
      debouncedSave.run();
    }
  };

  const handleTodosChange = (newTodos: TodoDraft[]) => {
    todosDirtyRef.current += 1;
    setTodos(newTodos);
    draftRef.current = { ...draftRef.current, todos: newTodos };
    if (isEdit && noteType === "CHECKBOX") {
      debouncedSave.run();
    }
  };

  const handleTodoTextChange = (index: number, text: string) => {
    const updated = [...todos];
    updated[index] = { ...updated[index], text };
    handleTodosChange(updated);
  };

  const handleAddTodo = () => {
    handleTodosChange([...todos, { key: makeKey(), text: "", done: false }]);
  };

  const handleRemoveTodo = (index: number) => {
    const updated = [...todos];
    updated.splice(index, 1);
    handleTodosChange(updated);
  };

  const handleReorder = (keys: string[]) => {
    const byKey = new Map(todos.map((todo) => [todo.key, todo]));
    const next = keys
      .map((key) => byKey.get(key))
      .filter((todo): todo is TodoDraft => Boolean(todo));
    if (next.length === todos.length) {
      handleTodosChange(next);
    }
  };

  const handleTodoKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const updated = [...todos];
      updated.splice(index + 1, 0, { key: makeKey(), text: "", done: false });
      handleTodosChange(updated);
    } else if (e.key === "Backspace" && todos[index].text === "" && todos.length > 1) {
      e.preventDefault();
      const updated = [...todos];
      updated.splice(index, 1);
      handleTodosChange(updated);
    }
  };

  const handleToggleTodo = async (index: number) => {
    const todo = todos[index];
    if (!note || !todo.id) return;

    const newDone = !todo.done;
    const updated = [...todos];
    updated[index] = { ...updated[index], done: newDone };
    todosDirtyRef.current += 1;
    setTodos(updated);
    draftRef.current = { ...draftRef.current, todos: updated };

    try {
      await toggleTodoComplete(note.id, [todo.id], newDone);
      onNoteUpdated({ ...note, todos: updated.map((t, i) => ({
        id: t.id || i,
        noteId: note.id,
        text: t.text,
        done: t.done,
        order: i,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) });
    } catch {
      const rolled = [...todos];
      rolled[index] = { ...rolled[index], done: !newDone };
      setTodos(rolled);
      draftRef.current = { ...draftRef.current, todos: rolled };
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const payload =
        noteType === "CHECKBOX"
          ? { title: title || "Untitled", type: noteType as "CHECKBOX", todos: todos.map((t) => t.text), content: "" }
          : { title: title || "Untitled", type: noteType as "PARAGRAPH", content, todos: [] };

      const created = await createNote(payload);
      onNoteCreated(created);
      onClose();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    debouncedSave.cancel();
    try {
      await deleteNote(note.id);
      onNoteDeleted(note.id);
      onClose();
    } catch {
      // silent
    }
  };

  const handleTypeToggle = (newType: "PARAGRAPH" | "CHECKBOX") => {
    if (newType === noteType) return;
    todosDirtyRef.current += 1;
    setNoteType(newType);

    let nextTodos = todos;
    let nextContent = content;

    if (newType === "CHECKBOX" && content.trim()) {
      const lines = content.split("\n").filter((l) => l.trim());
      nextTodos = lines.map((text) => ({ key: makeKey(), text, done: false }));
      nextContent = "";
      setTodos(nextTodos);
      setContent("");
    } else if (newType === "PARAGRAPH" && todos.length > 0) {
      nextTodos = [];
      nextContent = todos.map((t) => t.text).join("\n");
      setTodos([]);
      setContent(nextContent);
    }

    draftRef.current = {
      ...draftRef.current,
      noteType: newType,
      content: nextContent,
      todos: nextTodos,
    };

    if (isEdit) {
      debouncedSave.run();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-[calc(100%-1.5rem)] sm:w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Note title"
            className="flex-1 text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2 ml-4">
            {saving && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
            <button onClick={handleClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center gap-2">
          <button
            onClick={() => handleTypeToggle("PARAGRAPH")}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${noteType === "PARAGRAPH"
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-surface border border-transparent"
              }
            `}
          >
            <AlignLeft size={14} />
            Paragraph
          </button>
          <button
            onClick={() => handleTypeToggle("CHECKBOX")}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${noteType === "CHECKBOX"
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-surface border border-transparent"
              }
            `}
          >
            <CheckSquare size={14} />
            Checkbox
          </button>
        </div>

        <div className="flex-1 min-h-[200px] sm:min-h-[340px] overflow-y-auto px-4 sm:px-6 py-4">
          {noteType === "PARAGRAPH" ? (
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing..."
              className="w-full h-full min-h-[180px] sm:min-h-[300px] bg-transparent text-sm text-foreground leading-relaxed outline-none resize-none placeholder:text-muted-foreground"
            />
          ) : (
            <div>
              <Reorder.Group
                as="div"
                axis="y"
                values={todos.map((todo) => todo.key)}
                onReorder={handleReorder}
                className="space-y-1"
              >
                <AnimatePresence initial={false}>
                  {todos.map((todo, index) => (
                    <TodoRow
                      key={todo.key}
                      todo={todo}
                      index={index}
                      showRemove={todos.length > 1}
                      canToggle={isEdit && Boolean(todo.id)}
                      onToggle={handleToggleTodo}
                      onTextChange={handleTodoTextChange}
                      onKeyDown={handleTodoKeyDown}
                      onRemove={handleRemoveTodo}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
              <button
                type="button"
                onClick={handleAddTodo}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
              >
                + Add item
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-t border-border">
          {isEdit ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
              >
                <Trash2 size={14} />
                Delete
              </button>
              {onArchive && (
                <button
                  onClick={() => {
                    onArchive(note.id);
                    handleClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all"
                >
                  <Archive size={14} />
                  {note.archived ? "Unarchive" : "Archive"}
                </button>
              )}
            </div>
          ) : (
            <div />
          )}

          {!isEdit && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Save Note"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteModal;
