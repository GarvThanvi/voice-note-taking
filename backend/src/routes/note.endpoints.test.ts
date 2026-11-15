import "./../testEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";

const skip = !process.env.TEST_DATABASE_URL;
let userId: number;
let token: string;

test("setup", { skip }, async () => {
  const user = await prisma.user.create({ data: { email: `mcp${Date.now()}@test.dev`, username: "mcp", password: "x" } });
  userId = user.id;
  token = signToken(userId);
});

test("GET /api/note/:id returns a trashed note so it can be restored", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "PARAGRAPH", title: "Dentist", content: "Tuesday", deletedAt: new Date() } });
  const res = await request(app).get(`/api/note/${note.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.note.deletedAt !== null, true);
});

test("DELETE /api/note/:noteId/todo/:todoId removes exactly one todo", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "List", content: "" } });
  const [a, b] = await Promise.all([
    prisma.todo.create({ data: { noteId: note.id, text: "milk", order: 0 } }),
    prisma.todo.create({ data: { noteId: note.id, text: "eggs", order: 1 } }),
  ]);
  const res = await request(app).delete(`/api/note/${note.id}/todo/${a.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.note.todos.map((t: { id: number }) => t.id), [b.id]);
});

test("two concurrent appends both survive", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Concurrent", content: "" } });
  await Promise.all([
    request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["one"] }),
    request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["two"] }),
  ]);
  const todos = await prisma.todo.findMany({ where: { noteId: note.id } });
  assert.deepEqual(todos.map((t) => t.text).sort(), ["one", "two"]);
});

test("append on a paragraph note is refused", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "PARAGRAPH", title: "P", content: "x" } });
  const res = await request(app).post(`/api/note/${note.id}/todos`).set("Authorization", `Bearer ${token}`).send({ items: ["milk"] });
  assert.equal(res.status, 400);
});

test("another user's note is 404, not 403", { skip }, async () => {
  const other = await prisma.user.create({ data: { email: `other${Date.now()}@test.dev`, username: "other", password: "x" } });
  const note = await prisma.note.create({ data: { userId: other.id, type: "PARAGRAPH", title: "Secret", content: "x" } });
  const res = await request(app).get(`/api/note/${note.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 404);
});

test("GET /api/note/:noteId orders tied todos by id", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Ties", content: "" } });
  await prisma.todo.createMany({
    data: [
      { noteId: note.id, text: "first", order: 0 },
      { noteId: note.id, text: "second", order: 0 },
    ],
  });
  const res = await request(app).get(`/api/note/${note.id}`).set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 200);
  const ids: number[] = res.body.note.todos.map((t: { id: number }) => t.id);
  assert.equal(ids.length, 2);
  assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
});

test("PUT todo done only leaves text untouched", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Done only", content: "" } });
  const [a, b] = await Promise.all([
    prisma.todo.create({ data: { noteId: note.id, text: "milk", done: false, order: 0 } }),
    prisma.todo.create({ data: { noteId: note.id, text: "eggs", done: true, order: 1 } }),
  ]);
  const res = await request(app).put(`/api/note/${note.id}/todo/${a.id}`).set("Authorization", `Bearer ${token}`).send({ done: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const updated = res.body.note.todos.find((t: { id: number }) => t.id === a.id);
  assert.ok(updated);
  assert.equal(updated.done, true);
  assert.equal(updated.text, "milk");
  const sibling = res.body.note.todos.find((t: { id: number }) => t.id === b.id);
  assert.ok(sibling);
  assert.equal(sibling.done, true);
  assert.equal(sibling.text, "eggs");
});

test("PUT todo text only leaves done untouched", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Text only", content: "" } });
  const todo = await prisma.todo.create({ data: { noteId: note.id, text: "milk", done: true, order: 0 } });
  const res = await request(app).put(`/api/note/${note.id}/todo/${todo.id}`).set("Authorization", `Bearer ${token}`).send({ text: "oat milk" });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const updated = res.body.note.todos.find((t: { id: number }) => t.id === todo.id);
  assert.ok(updated);
  assert.equal(updated.text, "oat milk");
  assert.equal(updated.done, true);
});

test("PUT todo rejects an empty body", { skip }, async () => {
  const note = await prisma.note.create({ data: { userId, type: "CHECKBOX", title: "Empty body", content: "" } });
  const todo = await prisma.todo.create({ data: { noteId: note.id, text: "milk", order: 0 } });
  const res = await request(app).put(`/api/note/${note.id}/todo/${todo.id}`).set("Authorization", `Bearer ${token}`).send({});
  assert.equal(res.status, 400);
});

test("PUT todo from another note is 404 and changes nothing", { skip }, async () => {
  const [noteA, noteB] = await Promise.all([
    prisma.note.create({ data: { userId, type: "CHECKBOX", title: "A", content: "" } }),
    prisma.note.create({ data: { userId, type: "CHECKBOX", title: "B", content: "" } }),
  ]);
  const [todoA, todoB] = await Promise.all([
    prisma.todo.create({ data: { noteId: noteA.id, text: "a", order: 0 } }),
    prisma.todo.create({ data: { noteId: noteB.id, text: "b", order: 0 } }),
  ]);
  const res = await request(app).put(`/api/note/${noteA.id}/todo/${todoB.id}`).set("Authorization", `Bearer ${token}`).send({ text: "hijacked" });
  assert.equal(res.status, 404);
  const [afterA, afterB] = await Promise.all([
    prisma.todo.findUnique({ where: { id: todoA.id } }),
    prisma.todo.findUnique({ where: { id: todoB.id } }),
  ]);
  assert.ok(afterA);
  assert.ok(afterB);
  assert.equal(afterA.text, "a");
  assert.equal(afterB.text, "b");
});
