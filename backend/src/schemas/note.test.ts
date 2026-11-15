import test from "node:test";
import assert from "node:assert/strict";
import { noteSchema, updateNoteSchema } from "./note.js";

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
