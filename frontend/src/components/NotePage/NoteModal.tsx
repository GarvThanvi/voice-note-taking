import { useState, useEffect, useRef } from "react";
import { X, Trash2, CheckSquare, AlignLeft } from "lucide-react";
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
}

const NoteModal = ({ isOpen, note, onClose, onNoteCreated, onNoteUpdated, onNoteDeleted }: NoteModalProps) => {
  const isEdit = !!note;
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.type === "PARAGRAPH" ? (note?.content || "") : "");
  const [noteType, setNoteType] = useState<"PARAGRAPH" | "CHECKBOX">(note?.type || "PARAGRAPH");
  const [todos, setTodos] = useState<{ text: string; done: boolean; id?: number }[]>(
    note?.type === "CHECKBOX" ? (note?.todos?.map((t) => ({ text: t.text, done: t.done, id: t.id })) || []) : []
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const debouncedSave = useDebouncedCallback(async (overrides: { title?: string; content?: string; noteType?: "PARAGRAPH" | "CHECKBOX"; todos?: { text: string; done: boolean; id?: number }[] }) => {
    if (!note) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const t = overrides.title ?? title;
      const c = overrides.content ?? content;
      const nt = overrides.noteType ?? noteType;
      const tl = overrides.todos ?? todos;

      const payload =
        nt === "CHECKBOX"
          ? { title: t, type: nt, todos: tl.map((td) => td.text), content: "" }
          : { title: t, type: nt, content: c, todos: [] };

      const updated = await updateNote(note.id, payload);
      onNoteUpdated(updated);
    } catch {
      // silent
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, 2000);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (isEdit) {
      debouncedSave({ title: value });
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (isEdit && noteType === "PARAGRAPH") {
      debouncedSave({ content: value });
    }
  };

  const handleTodosChange = (newTodos: { text: string; done: boolean; id?: number }[]) => {
    setTodos(newTodos);
    if (isEdit && noteType === "CHECKBOX") {
      debouncedSave({ todos: newTodos });
    }
  };

  const handleTodoTextChange = (index: number, text: string) => {
    const updated = [...todos];
    updated[index] = { ...updated[index], text };
    handleTodosChange(updated);
  };

  const handleAddTodo = () => {
    handleTodosChange([...todos, { text: "", done: false }]);
  };

  const handleTodoKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const updated = [...todos];
      updated.splice(index + 1, 0, { text: "", done: false });
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
    setTodos(updated);

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
    setNoteType(newType);
    if (newType === "CHECKBOX" && content.trim()) {
      const lines = content.split("\n").filter((l) => l.trim());
      setTodos(lines.map((text) => ({ text, done: false })));
      setContent("");
    } else if (newType === "PARAGRAPH" && todos.length > 0) {
      setContent(todos.map((t) => t.text).join("\n"));
      setTodos([]);
    }
    if (isEdit) {
      debouncedSave({
        noteType: newType,
        content: newType === "PARAGRAPH" ? content : "",
        todos: newType === "CHECKBOX" ? todos : [],
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
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

        <div className="flex-1 min-h-[340px] overflow-y-auto px-6 py-4">
          {noteType === "PARAGRAPH" ? (
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing..."
              className="w-full h-full min-h-[300px] bg-transparent text-sm text-foreground leading-relaxed outline-none resize-none placeholder:text-muted-foreground"
            />
          ) : (
            <div className="space-y-1">
              {todos.map((todo, index) => (
                <div key={index} className="flex items-center gap-3 group">
                  <button
                    onClick={() => isEdit && todo.id ? handleToggleTodo(index) : undefined}
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
                    onChange={(e) => handleTodoTextChange(index, e.target.value)}
                    onKeyDown={(e) => handleTodoKeyDown(e, index)}
                    placeholder="New item"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {todos.length > 1 && (
                    <button
                      onClick={() => {
                        const updated = [...todos];
                        updated.splice(index, 1);
                        handleTodosChange(updated);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddTodo}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
              >
                + Add item
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          {isEdit ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={14} />
              Delete
            </button>
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
