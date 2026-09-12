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
  searchQuery?: string | undefined;
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
    case "mark_done":
      return executeMarkDone(userId, intent, resolution);
    case "update_todo":
      return executeUpdateTodo(userId, intent, resolution);
    case "update_note":
      return executeUpdateNote(userId, intent, resolution);
    case "search":
      return executeSearch(intent);
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

const executeMarkDone = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  if (resolution.status !== "found") {
    return {
      status: "not_found",
      action: "mark_done",
      summary: `No matching todo found for "${intent.todo_hint || ""}"`,
    };
  }

  const target = resolution.target;

  if (!target.todoId) {
    return {
      status: "not_found",
      action: "mark_done",
      summary: "Could not identify a specific todo item.",
    };
  }

  const todo = await prisma.todo.findFirst({
    where: {
      id: target.todoId,
      note: { userId, archived: false },
    },
    include: { note: true },
  });

  if (!todo) {
    return {
      status: "not_found",
      action: "mark_done",
      summary: "Todo not found or access denied.",
    };
  }

  if (todo.note.type === "PARAGRAPH") {
    return {
      status: "not_found",
      action: "mark_done",
      summary: `"${todo.note.title || "Untitled"}" is a paragraph note and doesn't have todos to mark as done.`,
    };
  }

  const newDone = !todo.done;

  await prisma.todo.update({
    where: { id: todo.id },
    data: { done: newDone },
  });

  const noteWithTodos = await prisma.note.findUnique({
    where: { id: todo.noteId },
    include: { todos: { orderBy: { order: "asc" } } },
  });

  const undoToken = createUndoToken("mark_done", userId, {
    todoId: todo.id,
    previousDone: todo.done,
  });

  return {
    status: "done",
    action: "mark_done",
    noteId: todo.noteId,
    todoId: todo.id,
    summary: newDone
      ? `Marked "${todo.text}" as done in "${todo.note.title || "Untitled"}"`
      : `Unmarked "${todo.text}" in "${todo.note.title || "Untitled"}"`,
    undoToken,
    note: noteWithTodos as ExecutionNote,
  };
};

const executeUpdateTodo = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  if (resolution.status !== "found") {
    return {
      status: "not_found",
      action: "update_todo",
      summary: `No matching todo found for "${intent.todo_hint || ""}"`,
    };
  }

  const target = resolution.target;

  if (!target.todoId) {
    return {
      status: "not_found",
      action: "update_todo",
      summary: "Could not identify a specific todo item.",
    };
  }

  const todo = await prisma.todo.findFirst({
    where: {
      id: target.todoId,
      note: { userId, archived: false },
    },
    include: { note: true },
  });

  if (!todo) {
    return {
      status: "not_found",
      action: "update_todo",
      summary: "Todo not found or access denied.",
    };
  }

  if (todo.note.type === "PARAGRAPH") {
    return {
      status: "not_found",
      action: "update_todo",
      summary: `"${todo.note.title || "Untitled"}" is a paragraph note. Use update_note to modify its content.`,
    };
  }

  const newText = intent.updates?.new_text;
  if (!newText) {
    return {
      status: "not_found",
      action: "update_todo",
      summary: "No new text provided for the update.",
    };
  }

  await prisma.todo.update({
    where: { id: todo.id },
    data: { text: newText },
  });

  const noteWithTodos = await prisma.note.findUnique({
    where: { id: todo.noteId },
    include: { todos: { orderBy: { order: "asc" } } },
  });

  const undoToken = createUndoToken("update_todo", userId, {
    todoId: todo.id,
    previousText: todo.text,
  });

  return {
    status: "done",
    action: "update_todo",
    noteId: todo.noteId,
    todoId: todo.id,
    summary: `Updated "${todo.text}" to "${newText}" in "${todo.note.title || "Untitled"}"`,
    undoToken,
    note: noteWithTodos as ExecutionNote,
  };
};

const executeUpdateNote = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  if (resolution.status !== "found") {
    return {
      status: "not_found",
      action: "update_note",
      summary: `No matching note found for "${intent.note_hint || ""}"`,
    };
  }

  const target = resolution.target;

  const note = await prisma.note.findFirst({
    where: { id: target.noteId, userId, archived: false },
    include: { todos: true },
  });

  if (!note) {
    return {
      status: "not_found",
      action: "update_note",
      summary: "Note not found or access denied.",
    };
  }

  if (note.type === "CHECKBOX") {
    return {
      status: "not_found",
      action: "update_note",
      summary: `"${note.title || "Untitled"}" is a checklist. Use add_todo to add items.`,
    };
  }

  const contentToAdd = intent.content_paragraph;
  if (!contentToAdd) {
    return {
      status: "not_found",
      action: "update_note",
      summary: "No content provided to append.",
    };
  }

  const separator = note.content ? "\n" : "";
  const newContent = note.content + separator + contentToAdd;

  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { content: newContent },
    include: { todos: true },
  });

  const undoToken = createUndoToken("update_note", userId, {
    noteId: note.id,
    previousContent: note.content,
  });

  return {
    status: "done",
    action: "update_note",
    noteId: note.id,
    summary: `Appended content to "${note.title || "Untitled"}"`,
    undoToken,
    note: updated as ExecutionNote,
  };
};

const executeSearch = async (
  intent: VoiceIntent
): Promise<ExecutionResult> => {
  const searchTerm = intent.note_hint || intent.todo_hint || "";

  return {
    status: "done",
    action: "search",
    summary: searchTerm
      ? `Searching for "${searchTerm}"`
      : "What would you like to search for?",
    searchQuery: searchTerm || undefined,
  };
};
