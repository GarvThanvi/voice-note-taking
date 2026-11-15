import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools, toSearchResult, toolNames } from "./tools.js";
import type { ApiResponse, NoteFlowApi } from "./client.js";
import { READ_SCOPE, WRITE_SCOPE } from "../lib/mcpTokens.js";

const paragraph = {
  id: 12, title: "Dentist", type: "PARAGRAPH" as const,
  content: "x".repeat(400), labels: [{ id: 1, name: "Health", color: "#00FF00" }],
  archived: false, updatedAt: new Date("2026-11-01T10:00:00Z"),
};
const checklist = {
  id: 13, title: "Shopping", type: "CHECKBOX" as const,
  todos: [{ id: 1, text: "milk", done: false }, { id: 2, text: "eggs", done: true }],
  labels: [], archived: false, updatedAt: new Date("2026-11-01T10:00:00Z"),
};

test("toSearchResult truncates paragraph content at 200 chars", () => {
  const result = toSearchResult(paragraph as any);
  assert.equal(result.id, 12);
  assert.equal(result.snippet.length, 200);
  assert.equal(result.truncated, true);
});

test("toSearchResult summarises a checklist from its todo texts", () => {
  const result = toSearchResult(checklist as any);
  assert.equal(result.snippet, "milk · eggs");
  assert.equal(result.truncated, false);
});

test("toSearchResult leaves short content untruncated", () => {
  const result = toSearchResult({ ...paragraph, content: "short" } as any);
  assert.equal(result.snippet, "short");
  assert.equal(result.truncated, false);
});

test("toolNames reports only read tools for a read-only token", () => {
  const ctx = { userId: 1, scopes: [READ_SCOPE], api: {} as any };
  assert.deepEqual(toolNames(ctx), ["search_notes", "get_note", "list_labels"]);
});

test("toolNames reports all eleven tools for a read-write token", () => {
  const ctx = { userId: 1, scopes: [READ_SCOPE, WRITE_SCOPE], api: {} as any };
  const names = toolNames(ctx);
  assert.equal(names.length, 11);
  assert.ok(names.includes("delete_note") && names.includes("restore_note"));
});

// --- read tool handlers, exercised through a fake server (no network) ---

type Handler = (args: any) => Promise<any>;

const fakeServer = () => {
  const handlers: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      handlers[name] = handler;
      return server;
    },
  } as unknown as McpServer;
  return { server, handlers };
};

const fakeApi = (
  respond: (path: string) => ApiResponse | Promise<ApiResponse>,
): { api: NoteFlowApi; paths: string[] } => {
  const paths: string[] = [];
  const empty: ApiResponse = { ok: false, status: 500, data: null };

  return {
    api: {
      get: (path) => {
        paths.push(path);
        return Promise.resolve(respond(path));
      },
      post: async () => empty,
      put: async () => empty,
      del: async () => empty,
    },
    paths,
  };
};

const readCtx = (api: NoteFlowApi) => ({
  userId: 1,
  scopes: [READ_SCOPE] as readonly string[],
  api,
});

const listResponse: ApiResponse = {
  ok: true,
  status: 200,
  data: {
    success: true,
    message: { notes: [paragraph], total: 1, page: 1, hasMore: false },
  },
};

test("registerReadTools registers the three read tools", () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => listResponse);

  registerReadTools(server, readCtx(api));

  assert.deepEqual(Object.keys(handlers), [
    "search_notes",
    "get_note",
    "list_labels",
  ]);
});

test("search_notes sends the query and derives the archived/trashed flags", async () => {
  const { server, handlers } = fakeServer();
  const { api, paths } = fakeApi(() => listResponse);
  registerReadTools(server, readCtx(api));

  await handlers.search_notes!({ query: "milk" });
  await handlers.search_notes!({ scope: "archived" });
  await handlers.search_notes!({ scope: "trashed" });
  await handlers.search_notes!({ scope: "active" });

  assert.match(paths[0]!, /[?&]search=milk(&|$)/);
  assert.match(paths[1]!, /[?&]archived=true(&|$)/);
  assert.doesNotMatch(paths[1]!, /trashed=/);
  assert.match(paths[2]!, /[?&]trashed=true(&|$)/);
  assert.doesNotMatch(paths[2]!, /archived=/);
  assert.doesNotMatch(paths[3]!, /archived=|trashed=/);
});

test("search_notes maps the API's 404 message to an error result", async () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => ({
    ok: false,
    status: 404,
    data: { success: false, message: "Note not found" },
  }));
  registerReadTools(server, readCtx(api));

  const result = await handlers.search_notes!({ query: "milk" });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Note not found/);
});

test("get_note unwraps data.note", async () => {
  const { server, handlers } = fakeServer();
  const { api, paths } = fakeApi(() => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      note: { ...paragraph, id: 12, title: "Dentist visit" },
      message: "ignored when data.note is present",
    },
  }));
  registerReadTools(server, readCtx(api));

  const result = await handlers.get_note!({ noteId: 12 });

  assert.equal(paths[0], "/note/12");
  assert.equal(JSON.parse(result.content[0].text).id, 12);
  assert.match(result.content[0].text, /Dentist visit/);
});

test("list_labels unwraps data.labels", async () => {
  const { server, handlers } = fakeServer();
  const { api, paths } = fakeApi(() => ({
    ok: true,
    status: 200,
    data: {
      success: true,
      labels: [
        { id: 1, name: "Health", color: "#00FF00", noteCount: 3 },
      ],
      message: "ignored when data.labels is present",
    },
  }));
  registerReadTools(server, readCtx(api));

  const result = await handlers.list_labels!({});

  assert.equal(paths[0], "/label");
  assert.deepEqual(JSON.parse(result.content[0].text), [
    { id: 1, name: "Health", color: "#00FF00", noteCount: 3 },
  ]);
});

test("a body-less internal response names the connector, not a missing note", async () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => ({ ok: false, status: 404, data: null }));
  registerReadTools(server, readCtx(api));

  const calls: Array<[string, any]> = [
    ["search_notes", { query: "milk" }],
    ["get_note", { noteId: 12 }],
    ["list_labels", {}],
  ];

  for (const [name, args] of calls) {
    const result = await handlers[name]!(args);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /internal API/);
    assert.match(result.content[0].text, /MCP_INTERNAL_SECRET/);
    assert.doesNotMatch(result.content[0].text, /not found/i);
  }
});
