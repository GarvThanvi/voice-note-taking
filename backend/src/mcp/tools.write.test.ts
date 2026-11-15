import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWriteTools, resolveLabelIds } from "./tools.js";
import type { ApiResponse, NoteFlowApi } from "./client.js";
import { READ_SCOPE, WRITE_SCOPE } from "../lib/mcpTokens.js";

test("addLabelIds keeps existing labels", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { addLabelIds: [3] }), [1, 2, 3]);
});

test("addLabelIds does not duplicate", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { addLabelIds: [2, 3] }), [1, 2, 3]);
});

test("removeLabelIds removes only what it names", () => {
  assert.deepEqual(resolveLabelIds([1, 2, 3], { removeLabelIds: [2] }), [1, 3]);
});

test("setLabelIds replaces the whole set", () => {
  assert.deepEqual(resolveLabelIds([1, 2], { setLabelIds: [9] }), [9]);
  assert.deepEqual(resolveLabelIds([1, 2], { setLabelIds: [] }), []);
});

test("label modes are mutually exclusive", () => {
  assert.throws(() => resolveLabelIds([1], { setLabelIds: [2], addLabelIds: [3] }), /one label mode/);
  assert.throws(() => resolveLabelIds([1], { addLabelIds: [3], removeLabelIds: [1] }), /one label mode/);
});

// --- write tool handlers, exercised through a fake server (no network) ---

type Handler = (args: any) => Promise<any>;

interface Call {
  method: "get" | "post" | "put" | "del";
  path: string;
  body?: unknown;
}

const fakeServer = () => {
  const handlers: Record<string, Handler> = {};
  const configs: Record<string, any> = {};
  const server = {
    registerTool: (name: string, config: any, handler: Handler) => {
      handlers[name] = handler;
      configs[name] = config;
      return server;
    },
  } as unknown as McpServer;
  return { server, handlers, configs };
};

const fakeApi = (respond: (call: Call) => ApiResponse | Promise<ApiResponse>) => {
  const calls: Call[] = [];
  const make = (method: Call["method"]) => (path: string, body?: unknown) => {
    const call: Call = { method, path };
    if (body !== undefined) call.body = body;
    calls.push(call);
    return Promise.resolve(respond(call));
  };
  const api: NoteFlowApi = {
    get: make("get"),
    post: make("post"),
    put: make("put"),
    del: make("del"),
  };
  return { api, calls };
};

const writeCtx = (api: NoteFlowApi) => ({
  userId: 1,
  scopes: [READ_SCOPE, WRITE_SCOPE] as readonly string[],
  api,
});

const readOnlyCtx = (api: NoteFlowApi) => ({
  userId: 1,
  scopes: [READ_SCOPE] as readonly string[],
  api,
});

const shopping = {
  id: 13,
  title: "Shopping",
  type: "CHECKBOX",
  todos: [
    { id: 1, text: "milk", done: false },
    { id: 2, text: "eggs", done: true },
  ],
  labels: [
    { id: 1, name: "Home", color: "#111111" },
    { id: 2, name: "Work", color: "#222222" },
  ],
  archived: false,
  deletedAt: null,
};

const okNote = (note: unknown): ApiResponse => ({
  ok: true,
  status: 200,
  data: { success: true, note },
});

const okNewNote = (note: unknown): ApiResponse => ({
  ok: true,
  status: 200,
  data: { success: true, newNote: note },
});

const payload = (result: any) => JSON.parse(result.content[0].text);

test("registerWriteTools registers the eight write tools", () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => okNote(shopping));

  registerWriteTools(server, writeCtx(api));

  assert.deepEqual(Object.keys(handlers), [
    "create_note",
    "create_checklist",
    "add_todos",
    "update_todo",
    "remove_todo",
    "update_note",
    "delete_note",
    "restore_note",
  ]);
});

test("every write tool refuses a read-only token before calling the API", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, readOnlyCtx(api));

  const callsToMake: Array<[string, any]> = [
    ["create_note", { title: "Dentist", content: "Book it" }],
    ["create_checklist", { title: "Shopping", items: ["milk"] }],
    ["add_todos", { noteId: 13, items: ["milk"] }],
    ["update_todo", { noteId: 13, todoId: 1, done: true }],
    ["remove_todo", { noteId: 13, todoId: 1 }],
    ["update_note", { noteId: 13, title: "Groceries" }],
    ["delete_note", { noteId: 13 }],
    ["restore_note", { noteId: 13 }],
  ];

  for (const [name, args] of callsToMake) {
    const result = await handlers[name]!(args);
    assert.equal(result.isError, true, `${name} must refuse a read-only token`);
    assert.match(result.content[0].text, /read-only/);
    assert.match(result.content[0].text, /read-write token in NoteFlow settings/);
  }

  assert.equal(calls.length, 0);
});

test("create_note posts a paragraph note and returns it with a change line", async () => {
  const created = {
    id: 20,
    title: "Dentist",
    type: "PARAGRAPH",
    content: "Book a check-up",
    labels: [],
    archived: false,
    deletedAt: null,
  };
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNewNote(created));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.create_note!({
    title: "Dentist",
    content: "Book a check-up",
  });

  assert.deepEqual(calls[0], {
    method: "post",
    path: "/note",
    body: {
      type: "PARAGRAPH",
      title: "Dentist",
      content: "Book a check-up",
      labelIds: [],
    },
  });
  assert.deepEqual(payload(result), {
    note: created,
    message: "Created note 20.",
  });
});

test("create_checklist posts a checkbox note with its items", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNewNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.create_checklist!({
    title: "Shopping",
    items: ["milk", "eggs"],
    labelIds: [2],
  });

  assert.deepEqual(calls[0], {
    method: "post",
    path: "/note",
    body: {
      type: "CHECKBOX",
      title: "Shopping",
      todos: ["milk", "eggs"],
      labelIds: [2],
    },
  });
  assert.equal(payload(result).message, "Created checklist 13 with 2 items.");
});

test("add_todos appends through the per-note todo route", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.add_todos!({
    noteId: 13,
    items: ["bread"],
  });

  assert.deepEqual(calls[0], {
    method: "post",
    path: "/note/13/todos",
    body: { items: ["bread"] },
  });
  assert.equal(payload(result).message, "Added 1 item to \"Shopping\".");
});

test("add_todos surfaces the API's 400 message verbatim", async () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => ({
    ok: false,
    status: 400,
    data: { success: false, message: "Note is not a checklist" },
  }));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.add_todos!({ noteId: 12, items: ["bread"] });

  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Note is not a checklist");
});

test("update_todo sends only the supplied fields to the per-todo route", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.update_todo!({
    noteId: 13,
    todoId: 2,
    done: true,
  });

  assert.deepEqual(calls[0], {
    method: "put",
    path: "/note/13/todo/2",
    body: { done: true },
  });
  assert.equal(payload(result).message, 'Updated todo 2 in "Shopping".');
});

test("remove_todo deletes the single todo and never replaces the array", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.remove_todo!({ noteId: 13, todoId: 2 });

  assert.deepEqual(calls[0], { method: "del", path: "/note/13/todo/2" });
  assert.equal(
    calls.some((call) => call.method === "put"),
    false,
    "remove_todo must not use the array-replacing PUT /note/:noteId",
  );
  assert.equal(payload(result).message, 'Removed todo 2 from "Shopping".');
});

test("update_note with addLabelIds keeps the labels it does not mention", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi((call) =>
    call.method === "get" ? okNote(shopping) : okNote({ ...shopping, title: "Groceries" }),
  );
  registerWriteTools(server, writeCtx(api));

  await handlers.update_note!({
    noteId: 13,
    title: "Groceries",
    addLabelIds: [3],
  });

  assert.deepEqual(
    calls.map((call) => [call.method, call.path]),
    [
      ["get", "/note/13"],
      ["put", "/note/13"],
    ],
  );
  assert.deepEqual(calls[1]!.body, { title: "Groceries", labelIds: [1, 2, 3] });
});

test("update_note without a label mode never sends labelIds", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote({ ...shopping, archived: true }));
  registerWriteTools(server, writeCtx(api));

  await handlers.update_note!({ noteId: 13, archived: true });

  assert.deepEqual(calls, [
    { method: "put", path: "/note/13", body: { archived: true } },
  ]);
});

test("update_note rejects two label modes without calling the API", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.update_note!({
    noteId: 13,
    setLabelIds: [1],
    addLabelIds: [2],
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /one label mode/);
  assert.equal(calls.length, 0);
});

test("update_note with removeLabelIds drops only the named label", async () => {
  const labelled = {
    ...shopping,
    labels: [
      { id: 1, name: "Home", color: "#111111" },
      { id: 2, name: "Work", color: "#222222" },
      { id: 3, name: "Urgent", color: "#333333" },
    ],
  };
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi((call) =>
    call.method === "get" ? okNote(labelled) : okNote(labelled),
  );
  registerWriteTools(server, writeCtx(api));

  await handlers.update_note!({ noteId: 13, removeLabelIds: [2] });

  assert.deepEqual(
    calls.map((call) => [call.method, call.path]),
    [
      ["get", "/note/13"],
      ["put", "/note/13"],
    ],
  );
  assert.deepEqual(calls[1]!.body, { labelIds: [1, 3] });
});

test("update_note with setLabelIds replaces the set without a preceding GET", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  await handlers.update_note!({ noteId: 13, setLabelIds: [9] });

  assert.deepEqual(calls, [
    { method: "put", path: "/note/13", body: { labelIds: [9] } },
  ]);
});

test("update_note fails closed when the note's label set is unreadable", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => ({
    ok: true,
    status: 200,
    data: { success: true, note: { id: 13 } },
  }));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.update_note!({ noteId: 13, addLabelIds: [3] });

  assert.equal(result.isError, true);
  assert.equal(
    calls.some((call) => call.method === "put"),
    false,
    "an unreadable label set must not be replaced by the added ids alone",
  );
});

test("update_note with no fields and no label mode refuses to call the API", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.update_note!({ noteId: 13 });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /title/);
  assert.match(result.content[0].text, /setLabelIds/);
  assert.equal(calls.length, 0);
});

test("delete_note trashes by default and deletes permanently only on request", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => ({
    ok: true,
    status: 200,
    data: { success: true, message: "done" },
  }));
  registerWriteTools(server, writeCtx(api));

  await handlers.delete_note!({ noteId: 13 });
  await handlers.delete_note!({ noteId: 13, permanent: false });
  await handlers.delete_note!({ noteId: 13, permanent: true });

  assert.deepEqual(
    calls.map((call) => [call.method, call.path]),
    [
      ["del", "/note/13"],
      ["del", "/note/13"],
      ["del", "/note/13/permanent"],
    ],
  );
});

test("a successful delete_note names the note and is not an error", async () => {
  const { server, handlers } = fakeServer();
  const { api } = fakeApi(() => ({
    ok: true,
    status: 200,
    data: { success: true, message: "Note moved to trash" },
  }));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.delete_note!({ noteId: 13 });

  assert.notEqual(result.isError, true);
  assert.equal(payload(result).note, null);
  assert.equal(payload(result).message, "Moved note 13 to the trash.");
});

test("restore_note clears deletedAt through the update route", async () => {
  const { server, handlers } = fakeServer();
  const { api, calls } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const result = await handlers.restore_note!({ noteId: 13 });

  assert.deepEqual(calls[0], {
    method: "put",
    path: "/note/13",
    body: { deletedAt: null },
  });
  assert.equal(payload(result).message, "Restored note 13 from the trash.");
});

test("only delete_note and remove_todo carry the destructive annotation", () => {
  const { server, configs } = fakeServer();
  const { api } = fakeApi(() => okNote(shopping));
  registerWriteTools(server, writeCtx(api));

  const destructive = Object.entries(configs)
    .filter(([, config]) => config.annotations?.destructiveHint === true)
    .map(([name]) => name)
    .sort();

  assert.deepEqual(destructive, ["delete_note", "remove_todo"]);
});
