import { prisma } from "./prisma.js";
import { createUndoToken } from "./undoStore.js";
import type { VoiceIntent } from "./extractIntent.js";
import type { ResolutionResult, ResolvedTarget } from "./resolveTarget.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  status: "done" | "ambiguous" | "not_found";
  action: string;
  noteId?: number;
  todoId?: number;
  summary: string;
  undoToken?: string;
  candidates?: ResolvedTarget[];
}

// ---------------------------------------------------------------------------
// executeAction — given a resolved intent + resolution, run the Prisma
// mutation and produce an undo token. Only handles create_note and add_todo
// for now (step 5). Other actions return "not yet supported".
// ---------------------------------------------------------------------------

export const executeAction = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  // Can't execute without a confident resolution (except create_note, which
  // creates something new).
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
      return executeCreateNote(userId, intent, resolution);

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

// ---------------------------------------------------------------------------
// create_note
// ---------------------------------------------------------------------------

const executeCreateNote = async (
  userId: number,
  intent: VoiceIntent,
  resolution: ResolutionResult
): Promise<ExecutionResult> => {
  const noteType = intent.note_type_hint || "PARAGRAPH";
  const title = intent.note_hint || "Untitled";

  if (noteType === "CHECKBOX") {
    // Create a note with a single todo item if todo_hint is present.
    const todoText = intent.todo_hint || title;

    const note = await prisma.$transaction(async (tx) => {
      const n = await tx.note.create({
        data: { userId, type: "CHECKBOX", title, content: "" },
      });

      await tx.todo.create({
        data: { noteId: n.id, text: todoText, order: 0 },
      });

      return tx.note.findUnique({
        where: { id: n.id },
        include: { todos: { orderBy: { order: "asc" } } },
      });
    });

    const undoToken = createUndoToken("create_note", userId, { noteId: note!.id });

    return {
      status: "done",
      action: "create_note",
      noteId: note!.id,
      summary: `Created checklist "${title}" with "${todoText}"`,
      undoToken,
    };
  }

  // PARAGRAPH — use content if provided, otherwise just the title.
  const content = intent.updates?.content || "";

  const note = await prisma.note.create({
    data: { userId, type: "PARAGRAPH", title, content },
  });

  const undoToken = createUndoToken("create_note", userId, { noteId: note.id });

  return {
    status: "done",
    action: "create_note",
    noteId: note.id,
    summary: `Created note "${title}"`,
    undoToken,
  };
};

// ---------------------------------------------------------------------------
// add_todo
// ---------------------------------------------------------------------------

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

  // Verify the note belongs to this user and is a CHECKBOX note.
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

  // If note is PARAGRAPH, convert it to CHECKBOX.
  if (note.type === "PARAGRAPH") {
    await prisma.note.update({
      where: { id: note.id },
      data: { type: "CHECKBOX", content: "" },
    });
  }

  const todoText = intent.todo_hint || "New item";
  const nextOrder = (note.todos[0]?.order ?? -1) + 1;

  const todo = await prisma.todo.create({
    data: { noteId: note.id, text: todoText, order: nextOrder },
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
  };
};
