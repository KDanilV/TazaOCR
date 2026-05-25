import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRowsAndMergesFromCells,
  buildMetadataRows,
  calculateColumnWidths,
  createExportFileName,
  createSafeSheetName,
  formatWorksheet,
} from "../src/xlsx-export.js";

test("creates Excel-safe sheet names", () => {
  assert.equal(createSafeSheetName("bad/name:*?[]"), "bad name");
  assert.equal(createSafeSheetName(""), "OCR Result");
  assert.equal(createSafeSheetName("a".repeat(40)), "a".repeat(31));
});

test("builds worksheet rows and merge ranges from structured cells", () => {
  const table = buildRowsAndMergesFromCells([
    { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: "Header" },
    { row: 1, col: 0, text: "A" },
    { row: 1, col: 1, text: "B" },
    { row: 2, col: 0, rowSpan: 2, colSpan: 1, text: "Tall" },
    { row: 2, col: 1, text: "C" },
    { row: 3, col: 1, text: "D" },
  ]);

  assert.deepEqual(table.rows, [
    ["Header", ""],
    ["A", "B"],
    ["Tall", "C"],
    ["", "D"],
  ]);
  assert.deepEqual(table.merges, [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
  ]);
});

test("creates filesystem-safe export file names", () => {
  assert.equal(createExportFileName("scan:01.pdf"), "scan 01-ocr.xlsx");
  assert.equal(createExportFileName(""), "scan-ocr.xlsx");
});

test("calculates bounded column widths", () => {
  assert.deepEqual(calculateColumnWidths([["a", "long value"], ["abc", "x"]], { minWidth: 4, maxWidth: 8 }), [
    { wch: 5 },
    { wch: 8 },
  ]);
});

test("builds metadata rows with optional dimensions", () => {
  assert.deepEqual(buildMetadataRows({ sourceFile: "a.jpg", mode: "Table OCR", rowCount: 2, columnCount: 3 }), [
    ["Source file", "a.jpg"],
    ["Mode", "Table OCR"],
    ["OCR language", ""],
    ["PDF page", ""],
    ["Exported at", ""],
    ["Rows", 2],
    ["Columns", 3],
  ]);
});

test("marks multiline worksheet cells for wrapping", () => {
  const worksheet = {
    A1: { v: "line 1\nline 2" },
    B1: { v: "plain" },
  };

  formatWorksheet(worksheet, [["line 1\nline 2", "plain"]]);

  assert.equal(worksheet.A1.s.alignment.wrapText, true);
  assert.equal(worksheet.B1.s, undefined);
  assert.deepEqual(worksheet["!cols"], [{ wch: 8 }, { wch: 8 }]);
});
