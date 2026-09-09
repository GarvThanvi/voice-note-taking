import { prisma } from "./prisma.js";
import { createUndoToken } from "./undoStore.js";
import type { VoiceIntent } from "./extractIntent.js";
import type { ResolutionResult, ResolvedTarget } from "./resolveTarget.js";

export interface ExecutionNote {
  id: number;
  userId: number;
  title: string | null;
  type: "PARAGRAPH" | "CHECKBOX";
  content: string;
  archived: boolean;
  bookmarked: boolean;
  createdAt: Date;
  updatedAt: Date;
  todos?: { id: number; noteId: number; text: string; done: boolean; order: number }[];
}

export interface ExecutionResult {
  status: "done" | "ambiguous" | "not_found";
  action: string;
  noteId?: number;
  todoId?: number;
  summary: string;
  undoToken?: string;
  candidates?: ResolvedTarget[];
  note?: ExecutionNote;
}

export const executeAction = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      action: intent.action,
      summary: "Multiple matches found. Please pick one.",
      candidates: resolution.candidates,
    };
  }

  if (resolution.status === "not_found" && intent.action !== "create_note") {
    return {
      status: "not_found",
      action: intent.action,
      summary: `No matching note found for "${intent.note_hint || intent.todo_hint || ""}"`,
    };
  }

  switch (intent.action) {
    case "create_note":
      return executeCreateNote(userId, intent);
    case "add_todo":
      return executeAddTodo(userId, intent, resolution);
    default:
      return {
        status: "not_found",
        action: intent.action,
        summary: `Action "${intent.action}" is not yet supported.`,
      };
  }
};

const executeCreateNote = async (
  userId: number,
  intent: VoiceIntent
): Promise<ExecutionResult> => {
  const noteType = intent.note_type_hint || "PARAGRAPH";
  const title = intent.note_hint || "Untitled";

  if (noteType === "CHECKBOX") {
    const items: string[] =
      intent.todo_items && intent.todo_items.length > 0
        ? intent.todo_items
        : intent.todo_hint
          ? [intent.todo_hint]
          : [];

    const note = await prisma.$transaction(async (tx) => {
      const n = await tx.note.create({
        data: { userId, type: "CHECKBOX", title, content: "" },
      });

      if (items.length > 0) {
        await tx.todo.createMany({
          data: items.map((text, i) => ({ noteId: n.id, text, order: i })),
        });
      }

      return tx.note.findUnique({
        where: { id: n.id },
        include: { todos: { orderBy: { order: "asc" } } },
      });
    });

    const undoToken = createUndoToken("create_note", userId, { noteId: note!.id });
    const itemCount = items.length;

    return {
      status: "done",
      action: "create_note",
      noteId: note!.id,
      summary: itemCount > 0
        ? `Created checklist "${title}" with ${itemCount} item${itemCount > 1 ? "s" : ""}`
        : `Created checklist "${title}"`,
      undoToken,
      note: note as ExecutionNote,
    };
  }

  const content = intent.content_paragraph || "";
  const note = await prisma.note.create({
    data: { userId, type: "PARAGRAPH", title, content },
  });
  const undoToken = createUndoToken("create_note", userId, { noteId: note.id });

  return {
    status: "done",
    action: "create_note",
    noteId: note.id,
    summary: content ? `Created note "${title}" with content` : `Created note "${title}"`,
    undoToken,
    note: note as ExecutionNote,
  };
};

const executeAddTodo = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  if (resolution.status !== "found") {
    return {
      status: "not_found",
      action: "add_todo",
      summary: `No matching note found for "${intent.note_hint || ""}"`,
    };
  }

  const target = resolution.target;

  const note = await prisma.note.findFirst({
    where: { id: target.noteId, userId, archived: false },
    include: { todos: { orderBy: { order: "desc" } } },
  });

  if (!note) {
    return {
      status: "not_found",
      action: "add_todo",
      summary: "Note not found or access denied.",
    };
  }

  const todoText = intent.todo_hint || "New item";

  if (note.type === "PARAGRAPH") {
    const separator = note.content ? "\n" : "";
    const newContent = note.content + separator + `- ${todoText}`;

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: { content: newContent },
      include: { todos: true },
    });

    const undoToken = createUndoToken("add_todo", userId, {
      noteId: note.id,
      previousContent: note.content,
      type: "paragraph",
    });

    return {
      status: "done",
      action: "add_todo",
      noteId: note.id,
      summary: `Added "${todoText}" to "${note.title || "Untitled"}"`,
      undoToken,
      note: updated as ExecutionNote,
    };
  }

  const nextOrder = (note.todos[0]?.order ?? -1) + 1;
  const todo = await prisma.todo.create({
    data: { noteId: note.id, text: todoText, order: nextOrder },
  });

  const noteWithTodos = await prisma.note.findUnique({
    where: { id: note.id },
    include: { todos: { orderBy: { order: "asc" } } },
  });

  const undoToken = createUndoToken("add_todo", userId, {
    todoId: todo.id,
    noteId: note.id,
  });

  return {
    status: "done",
    action: "add_todo",
    noteId: note.id,
    todoId: todo.id,
    summary: `Added "${todoText}" to "${note.title || "Untitled"}"`,
    undoToken,
    note: noteWithTodos as ExecutionNote,
  };
};
