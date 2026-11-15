import test from "node:test";
import assert from "node:assert/strict";
import { labelSchema, updateLabelSchema } from "./label.js";

test("labelSchema uppercases a valid hex color", () => {
  const parsed = labelSchema.parse({ name: "Work", color: "#ff4058" });
  assert.equal(parsed.color, "#FF4058");
});

test("labelSchema trims the name", () => {
  assert.equal(
    labelSchema.parse({ name: "  Work  ", color: "#ff4058" }).name,
    "Work",
  );
});

test("labelSchema rejects malformed colors", () => {
  for (const color of ["red", "#FFF", "#GGGGGG", "#ff40588", ""]) {
    assert.equal(
      labelSchema.safeParse({ name: "Work", color }).success,
      false,
      color,
    );
  }
});

test("labelSchema rejects empty and over-long names", () => {
  assert.equal(
    labelSchema.safeParse({ name: "   ", color: "#ff4058" }).success,
    false,
  );
  assert.equal(
    labelSchema.safeParse({ name: "a".repeat(31), color: "#ff4058" }).success,
    false,
  );
  assert.equal(
    labelSchema.safeParse({ name: "a".repeat(30), color: "#ff4058" }).success,
    true,
  );
});

test("updateLabelSchema accepts empty and partial input", () => {
  assert.equal(updateLabelSchema.safeParse({}).success, true);
  assert.equal(updateLabelSchema.safeParse({ color: "#00ff00" }).success, true);
});
