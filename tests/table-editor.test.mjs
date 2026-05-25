import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteColumnAt,
  deleteRowAt,
  insertColumnAfter,
  insertRowAfter,
  normalizeTableRows,
} from "../src/table-editor.js";

test("normalizes ragged rows", () => {
  assert.deepEqual(normalizeTableRows([["a"], ["b", "c"]]), [["a", ""], ["b", "c"]]);
});

test("inserts a blank row after the active row", () => {
  assert.deepEqual(insertRowAfter([["a", "b"], ["c", "d"]], 0), [["a", "b"], ["", ""], ["c", "d"]]);
});

test("does not delete the last row", () => {
  assert.deepEqual(deleteRowAt([["a", "b"]], 0), [["a", "b"]]);
});

test("inserts a blank column after the active column", () => {
  assert.deepEqual(insertColumnAfter([["a", "b"], ["c", "d"]], 0), [["a", "", "b"], ["c", "", "d"]]);
});

test("does not delete the last column", () => {
  assert.deepEqual(deleteColumnAt([["a"], ["b"]], 0), [["a"], ["b"]]);
});
