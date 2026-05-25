import assert from "node:assert/strict";
import test from "node:test";

import { detectTableGrid, formatGridDetectionMessage } from "../src/table-grid.js";

test("detects a simple 2 by 2 grid from black lines", () => {
  const width = 80;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }

  for (const y of [10, 40, 70]) {
    for (let x = 0; x < width; x++) {
      setBlack(data, width, x, y);
    }
  }

  for (const x of [10, 40, 70]) {
    for (let y = 0; y < height; y++) {
      setBlack(data, width, x, y);
    }
  }

  const grid = detectTableGrid(data, width, height);
  assert.equal(grid.rows, 2);
  assert.equal(grid.cols, 2);
  assert.equal(grid.cells.length, 4);
  assert.equal(formatGridDetectionMessage(grid), "Найдено строк: 2, столбцов: 2, ячеек: 4.");
});

test("detects a light spreadsheet grid from gradient lines", () => {
  const width = 300;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }

  for (const y of [10, 40, 70, 100, 130, 160]) {
    for (let x = 0; x < width; x++) {
      setRgb(data, width, x, y, 196, 214, 226);
    }
  }

  for (const x of [10, 70, 160, 205, 250, 290]) {
    for (let y = 0; y < height; y++) {
      setRgb(data, width, x, y, 196, 214, 226);
    }
  }

  const grid = detectTableGrid(data, width, height);
  assert.equal(grid.rows, 5);
  assert.equal(grid.cols, 5);
  assert.equal(grid.cells.length, 25);
});

test("reports merged cells when an internal separator is missing in one row", () => {
  const width = 120;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }

  for (const y of [10, 40, 70]) {
    for (let x = 10; x <= 110; x++) {
      setBlack(data, width, x, y);
    }
  }

  for (const x of [10, 70, 110]) {
    for (let y = 10; y <= 70; y++) {
      setBlack(data, width, x, y);
    }
  }

  for (let y = 40; y <= 70; y++) {
    setBlack(data, width, 40, y);
  }

  const grid = detectTableGrid(data, width, height);
  assert.equal(grid.rows, 2);
  assert.equal(grid.cols, 3);
  assert.deepEqual(
    grid.mergedCells.map(({ row, col, rowSpan, colSpan }) => ({ row, col, rowSpan, colSpan })),
    [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { row: 0, col: 2, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 2, rowSpan: 1, colSpan: 1 },
    ],
  );
});

function setBlack(data, width, x, y) {
  const i = (y * width + x) * 4;
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 255;
}

function setRgb(data, width, x, y, r, g, b) {
  const i = (y * width + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}
