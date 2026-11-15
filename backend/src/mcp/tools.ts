import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiResponse, NoteFlowApi } from "./client.js";
import { WRITE_SCOPE } from "../lib/mcpTokens.js";

export interface ToolContext {
  userId: number;
  scopes: readonly string[];
  api: NoteFlowApi;
}

export interface NoteLabelRow {
  id: number;
  name: string;
  color: string;
}

export interface TodoRow {
  id: number;
  text: string;
  done?: boolean;
}

export interface NoteRow {
  id: number;
  title?: string | null;
  type: string;
  content?: string | null;
  todos?: TodoRow[] | null;
  labels?: NoteLabelRow[] | null;
  archived?: boolean;
  updatedAt?: Date | string | null;
}

export interface SearchResult {
  id: number;
  title: string;
  type: string;
  snippet: string;
  truncated: boolean;
  labels: NoteLabelRow[];
  updatedAt: Date | string | null;
}

const SNIPPET_LIMIT = 200;

const truncate = (text: string): { snippet: string; truncated: boolean } => ({
  snippet: text.slice(0, SNIPPET_LIMIT),
  truncated: text.length > SNIPPET_LIMIT,
});

export function toSearchResult(note: NoteRow): SearchResult {
  // Checklists are searched by their todo texts; paragraphs by their body.
  const source =
    note.type === "CHECKBOX"
      ? (note.todos ?? []).map((todo) => todo.text).join(" · ")
      : (note.content ?? "");

  const { snippet, truncated } = truncate(source);

  return {
    id: note.id,
    title: note.title ?? "",
    type: note.type,
    snippet,
    truncated,
    labels: note.labels ?? [],
    updatedAt: note.updatedAt ?? null,
  };
}

const READ_TOOLS = ["search_notes", "get_note", "list_labels"] as const;

const WRITE_TOOLS = [
  "create_note",
  "create_checklist",
  "add_todos",
  "update_todo",
  "remove_todo",
  "update_note",
  "delete_note",
  "restore_note",
] as const;

export function toolNames(ctx: ToolContext): string[] {
  return ctx.scopes.includes(WRITE_SCOPE)
    ? [...READ_TOOLS, ...WRITE_TOOLS]
    : [...READ_TOOLS];
}

export interface LabelDelta {
  setLabelIds?: number[] | undefined;
  addLabelIds?: number[] | undefined;
  removeLabelIds?: number[] | undefined;
}

const LABEL_MODE_ERROR = "Use exactly one label mode";

const labelModes = (args: LabelDelta) =>
  [args.setLabelIds, args.addLabelIds, args.removeLabelIds].filter(
    (mode) => mode !== undefined,
  );

// "Add the work label" must not drop the labels the caller never mentioned, so
// the deltas are resolved against the note's current set before the write.
export function resolveLabelIds(current: number[], args: LabelDelta): number[] {
  if (labelModes(args).length > 1) throw new Error(LABEL_MODE_ERROR);

  if (args.setLabelIds !== undefined) {
    return [...new Set(args.setLabelIds)];
  }

  if (args.addLabelIds !== undefined) {
    return [...new Set([...current, ...args.addLabelIds])];
  }

  if (args.removeLabelIds !== undefined) {
    const removed = new Set(args.removeLabelIds);
    return current.filter((id) => !removed.has(id));
  }

  return current;
}

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

// A body-less response comes from internalOnly rejecting the call (wrong or
// unset MCP_INTERNAL_SECRET), not from the route the tool meant to reach.
const NO_INTERNAL_RESPONSE =
  "The NoteFlow internal API returned no response. Check that the backend is running and that MCP_INTERNAL_SECRET matches its value.";

const failure = (response: ApiResponse) => {
  let message = NO_INTERNAL_RESPONSE;

  if (response.data !== null && response.data !== undefined) {
    message =
      typeof response.data.message === "string"
        ? response.data.message
        : `The NoteFlow internal API replied with status ${response.status}.`;
  }

  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
};

const SEARCH_SCOPES = ["active", "archived", "trashed"] as const;

const errorResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true,
});

// Checked before any API call in every write handler: hiding the tools from a
// read-only token is a listing decision, not an enforcement one.
const readOnlyError = () =>
  errorResult(
    "This token is read-only. Create a read-write token in NoteFlow settings.",
  );

export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "search_notes",
    {
      description:
        "Search your notes, newest matches first. Returns truncated snippets; call get_note for full content.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            "Case-insensitive text to match in titles, content and todos.",
          ),
        page: z.number().int().min(1).optional().describe("1-based page number."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Notes per page, default 12, maximum 50."),
        labelId: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Only notes carrying this label id."),
        scope: z
          .enum(SEARCH_SCOPES)
          .optional()
          .describe("active (default), archived or trashed."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const params = new URLSearchParams();
      if (args.query !== undefined) params.set("search", args.query);
      if (args.page !== undefined) params.set("page", String(args.page));
      if (args.limit !== undefined) params.set("limit", String(args.limit));
      if (args.labelId !== undefined) {
        params.set("labelId", String(args.labelId));
      }
      if (args.scope === "archived") params.set("archived", "true");
      if (args.scope === "trashed") params.set("trashed", "true");

      const query = params.toString();
      const response = await ctx.api.get(query ? `/note?${query}` : "/note");
      const result = response.data?.message;

      if (!response.ok || !result || !Array.isArray(result.notes)) {
        return failure(response);
      }

      return json({
        notes: result.notes.map(toSearchResult),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      });
    },
  );

  server.registerTool(
    "get_note",
    {
      description:
        "Fetch one note with its full content, todos and labels. Use before editing.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The note id from search_notes."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const response = await ctx.api.get(`/note/${args.noteId}`);

      if (!response.ok || !response.data?.note) {
        return failure(response);
      }

      return json(response.data.note);
    },
  );

  server.registerTool(
    "list_labels",
    {
      description: "List your labels with their ids, colours and note counts.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const response = await ctx.api.get("/label");

      if (!response.ok || !Array.isArray(response.data?.labels)) {
        return failure(response);
      }

      return json(response.data.labels);
    },
  );
}

const itemCount = (count: number) => `${count} item${count === 1 ? "" : "s"}`;

const titleOf = (note: { title?: string | null }) => note.title ?? "";

// The API answers with the note it just changed; the sentence says what moved.
const writeResult = (note: unknown, message: string) => json({ note, message });

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  const hasWriteScope = () => ctx.scopes.includes(WRITE_SCOPE);

  server.registerTool(
    "create_note",
    {
      description:
        "Create a paragraph note. Returns the new note with its id.",
      inputSchema: {
        title: z.string().describe("The note's title. May be empty."),
        content: z.string().describe("The note body, as plain text."),
        labelIds: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe("Label ids to attach, from list_labels."),
      },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const response = await ctx.api.post("/note", {
        type: "PARAGRAPH",
        title: args.title,
        content: args.content,
        labelIds: args.labelIds ?? [],
      });
      const note = response.data?.newNote;

      if (!response.ok || !note) return failure(response);

      return writeResult(note, `Created note ${note.id}.`);
    },
  );

  server.registerTool(
    "create_checklist",
    {
      description:
        "Create a checklist note from a list of item texts. Returns the new note with its id and todo ids.",
      inputSchema: {
        title: z.string().describe("The checklist's title. May be empty."),
        items: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("The item texts, in display order."),
        labelIds: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe("Label ids to attach, from list_labels."),
      },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const response = await ctx.api.post("/note", {
        type: "CHECKBOX",
        title: args.title,
        todos: args.items,
        labelIds: args.labelIds ?? [],
      });
      const note = response.data?.newNote;

      if (!response.ok || !note) return failure(response);

      return writeResult(
        note,
        `Created checklist ${note.id} with ${itemCount(args.items.length)}.`,
      );
    },
  );

  server.registerTool(
    "add_todos",
    {
      description:
        "Append items to an existing checklist. Returns the updated note. Fails on a paragraph note; use update_note for those.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The checklist's note id."),
        items: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("The item texts to append, in display order."),
      },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const response = await ctx.api.post(`/note/${args.noteId}/todos`, {
        items: args.items,
      });
      const note = response.data?.note;

      if (!response.ok || !note) return failure(response);

      return writeResult(
        note,
        `Added ${itemCount(args.items.length)} to "${titleOf(note)}".`,
      );
    },
  );

  server.registerTool(
    "update_todo",
    {
      description:
        "Change one checklist item's text or done state. Returns the updated note.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The checklist's note id."),
        todoId: z.number().int().min(1).describe("The todo id from get_note."),
        text: z
          .string()
          .min(1)
          .optional()
          .describe("Replacement item text; omit to keep it."),
        done: z
          .boolean()
          .optional()
          .describe("true to tick the item, false to untick it."),
      },
      annotations: { idempotentHint: true },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const body: { text?: string; done?: boolean } = {};
      if (args.text !== undefined) body.text = args.text;
      if (args.done !== undefined) body.done = args.done;

      const response = await ctx.api.put(
        `/note/${args.noteId}/todo/${args.todoId}`,
        body,
      );
      const note = response.data?.note;

      if (!response.ok || !note) return failure(response);

      return writeResult(
        note,
        `Updated todo ${args.todoId} in "${titleOf(note)}".`,
      );
    },
  );

  server.registerTool(
    "remove_todo",
    {
      description:
        "Delete one checklist item. Removes only the named todo; returns the updated note.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The checklist's note id."),
        todoId: z.number().int().min(1).describe("The todo id from get_note."),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const response = await ctx.api.del(
        `/note/${args.noteId}/todo/${args.todoId}`,
      );
      const note = response.data?.note;

      if (!response.ok || !note) return failure(response);

      return writeResult(
        note,
        `Removed todo ${args.todoId} from "${titleOf(note)}".`,
      );
    },
  );

  server.registerTool(
    "update_note",
    {
      description:
        "Change a note's title, content, bookmark or archive state, and its labels with one label mode. Omitted fields are left untouched. Returns the updated note.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The note id from search_notes."),
        title: z.string().optional().describe("New title."),
        content: z
          .string()
          .optional()
          .describe("New body for a paragraph note."),
        bookmarked: z.boolean().optional().describe("Bookmark state."),
        archived: z.boolean().optional().describe("Archive state."),
        setLabelIds: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe("Replace all labels with exactly these ids."),
        addLabelIds: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe("Add these labels, keeping the ones already set."),
        removeLabelIds: z
          .array(z.number().int().min(1))
          .max(20)
          .optional()
          .describe("Remove only these labels, keeping the rest."),
      },
      annotations: { idempotentHint: true },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const modes = labelModes(args);
      if (modes.length > 1) return errorResult(LABEL_MODE_ERROR);

      const body: Record<string, unknown> = {};
      const changed: string[] = [];

      for (const field of [
        "title",
        "content",
        "bookmarked",
        "archived",
      ] as const) {
        const value = args[field];
        if (value !== undefined) {
          body[field] = value;
          changed.push(field);
        }
      }

      if (changed.length === 0 && modes.length === 0) {
        return errorResult(
          "Provide at least one of title, content, bookmarked, archived, setLabelIds, addLabelIds or removeLabelIds.",
        );
      }

      // setLabelIds replaces the whole set, so it needs no read; add/remove are
      // deltas against the note's current labels.
      if (modes.length === 1) {
        if (args.setLabelIds !== undefined) {
          body.labelIds = resolveLabelIds([], args);
        } else {
          const existing = await ctx.api.get(`/note/${args.noteId}`);
          const current = existing.data?.note;

          if (!existing.ok || !current) return failure(existing);

          // Without the full current set, a delta would silently drop every
          // label the note already carries.
          if (!Array.isArray(current.labels)) return failure(existing);

          body.labelIds = resolveLabelIds(
            current.labels.map((label: NoteLabelRow) => label.id),
            args,
          );
        }

        changed.push("labels");
      }

      const response = await ctx.api.put(`/note/${args.noteId}`, body);
      const note = response.data?.note;

      if (!response.ok || !note) return failure(response);

      return writeResult(
        note,
        changed.length > 0
          ? `Updated note ${args.noteId}: ${changed.join(", ")}.`
          : `Updated note ${args.noteId}.`,
      );
    },
  );

  server.registerTool(
    "delete_note",
    {
      description:
        "Move a note to the trash. permanent:true is the only way to destroy it immediately.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The note id from search_notes."),
        permanent: z
          .boolean()
          .optional()
          .describe(
            "false (default) moves the note to the trash; true deletes it for good.",
          ),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      if (args.permanent === true) {
        const response = await ctx.api.del(`/note/${args.noteId}/permanent`);
        if (!response.ok) return failure(response);

        return writeResult(null, `Permanently deleted note ${args.noteId}.`);
      }

      const response = await ctx.api.del(`/note/${args.noteId}`);
      if (!response.ok) return failure(response);

      return writeResult(null, `Moved note ${args.noteId} to the trash.`);
    },
  );

  server.registerTool(
    "restore_note",
    {
      description:
        "Restore a trashed note. Returns the restored note, back in the active list.",
      inputSchema: {
        noteId: z.number().int().min(1).describe("The trashed note's id."),
      },
    },
    async (args) => {
      if (!hasWriteScope()) return readOnlyError();

      const response = await ctx.api.put(`/note/${args.noteId}`, {
        deletedAt: null,
      });
      const note = response.data?.note;

      if (!response.ok || !note) return failure(response);

      return writeResult(note, `Restored note ${args.noteId} from the trash.`);
    },
  );
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "noteflow", version: "1.0.0" },
    {
      instructions:
        "NoteFlow stores notes. Call search_notes before editing; note and todo ids are integers; never guess an id.",
    },
  );

  registerReadTools(server, ctx);

  if (ctx.scopes.includes(WRITE_SCOPE)) {
    registerWriteTools(server, ctx);
  }

  return server;
}
