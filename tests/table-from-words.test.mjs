import assert from "node:assert/strict";
import test from "node:test";

import { buildTableFromWords } from "../src/table-from-words.js";

test("builds a table from OCR words and coordinates", () => {
  const words = [
    word("№", 0, 0, 10, 10),
    word("Name", 50, 0, 90, 10),
    word("Qty", 140, 0, 165, 10),
    word("1", 0, 24, 8, 34),
    word("Выемка", 50, 24, 95, 34),
    word("45", 140, 24, 155, 34),
  ];

  assert.deepEqual(buildTableFromWords(words), [
    ["№", "Name", "Qty"],
    ["1", "Выемка", "45"],
  ]);
});

test("returns an empty table when OCR words have no boxes", () => {
  assert.deepEqual(buildTableFromWords([{ text: "value" }]), []);
});

test("keeps nearby words in the same visual cell", () => {
  const words = [
    word("Long", 40, 0, 70, 10),
    word("name", 76, 0, 110, 10),
    word("12", 180, 0, 195, 10),
  ];

  assert.deepEqual(buildTableFromWords(words), [["Long name", "12"]]);
});

function word(text, x0, y0, x1, y1) {
  return { text, bbox: { x0, y0, x1, y1 } };
}
