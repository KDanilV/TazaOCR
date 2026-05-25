import assert from "node:assert/strict";
import test from "node:test";

import { buildMergedCellsFromSeparators } from "../src/merged-cells.js";

test("builds colSpan cells when an internal vertical separator is missing", () => {
  const cells = buildMergedCellsFromSeparators({
    rows: 2,
    cols: 3,
    values: [
      ["Header", "", "C"],
      ["A", "B", "D"],
    ],
    verticalSeparators: [
      [true, false, true, true],
      [true, true, true, true],
    ],
    horizontalSeparators: [
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ],
  });

  assert.deepEqual(cells, [
    { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: "Header" },
    { row: 0, col: 2, rowSpan: 1, colSpan: 1, text: "C" },
    { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: "A" },
    { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: "B" },
    { row: 1, col: 2, rowSpan: 1, colSpan: 1, text: "D" },
  ]);
});

test("builds rowSpan cells when an internal horizontal separator is missing", () => {
  const cells = buildMergedCellsFromSeparators({
    rows: 3,
    cols: 2,
    values: [
      ["A", "B"],
      ["Tall", "C"],
      ["", "D"],
    ],
    verticalSeparators: [
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ],
    horizontalSeparators: [
      [true, true],
      [true, true],
      [false, true],
      [true, true],
    ],
  });

  assert.deepEqual(cells, [
    { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "A" },
    { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: "B" },
    { row: 1, col: 0, rowSpan: 2, colSpan: 1, text: "Tall" },
    { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: "C" },
    { row: 2, col: 1, rowSpan: 1, colSpan: 1, text: "D" },
  ]);
});

test("builds rectangular merged cells when both separators are missing", () => {
  const cells = buildMergedCellsFromSeparators({
    rows: 2,
    cols: 2,
    values: [["Merged"]],
    verticalSeparators: [
      [true, false, true],
      [true, false, true],
    ],
    horizontalSeparators: [
      [true, true],
      [false, false],
      [true, true],
    ],
  });

  assert.deepEqual(cells, [{ row: 0, col: 0, rowSpan: 2, colSpan: 2, text: "Merged" }]);
});
