import test from "node:test";
import assert from "node:assert/strict";
import {
  noteSchema,
  updateNoteSchema,
  appendTodosSchema,
  singleTodoUpdateSchema,
} from "./note.js";

test("noteSchema accepts labelIds", () => {
  assert.equal(
    noteSchema.safeParse({ type: "PARAGRAPH", content: "x", labelIds: [1, 2] })
      .success,
    true,
  );
});

test("noteSchema rejects non-integer labelIds", () => {
  assert.equal(
    noteSchema.safeParse({ type: "PARAGRAPH", labelIds: ["1"] }).success,
    false,
  );
  assert.equal(
    noteSchema.safeParse({ type: "PARAGRAPH", labelIds: [1.5] }).success,
    false,
  );
});

test("updateNoteSchema accepts an empty labelIds array and omission", () => {
  assert.equal(updateNoteSchema.safeParse({ labelIds: [] }).success, true);
  assert.equal(updateNoteSchema.safeParse({ title: "t" }).success, true);
});

test("appendTodosSchema trims, bounds and rejects empty lists", () => {
  assert.deepEqual(appendTodosSchema.parse({ items: ["  milk  "] }), { items: ["milk"] });
  assert.equal(appendTodosSchema.safeParse({ items: [] }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: Array(51).fill("x") }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: ["x".repeat(501)] }).success, false);
  assert.equal(appendTodosSchema.safeParse({ items: ["   "] }).success, false);
});

test("singleTodoUpdateSchema requires text or done", () => {
  assert.equal(singleTodoUpdateSchema.safeParse({ done: true }).success, true);
  assert.equal(singleTodoUpdateSchema.safeParse({ text: "milk" }).success, true);
  assert.equal(singleTodoUpdateSchema.safeParse({}).success, false);
  assert.equal(singleTodoUpdateSchema.safeParse({ text: "" }).success, false);
});
