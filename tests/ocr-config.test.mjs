import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OCR_LANGUAGE,
  getTesseractOptions,
  normalizeCellText,
  normalizeOcrText,
  parseOcrTextTable,
} from "../src/ocr-config.js";

test("uses Russian and English as default OCR language", () => {
  assert.equal(DEFAULT_OCR_LANGUAGE, "rus");
});

test("builds Tesseract options with overrides", () => {
  assert.deepEqual(getTesseractOptions({ tessedit_pageseg_mode: "7" }), {
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "7",
  });
});

test("normalizes OCR text while preserving line breaks", () => {
  assert.equal(normalizeOcrText("  Ведомость   объемов \r\n работ  "), "Ведомость объемов\nработ");
});

test("normalizes cell text to one line", () => {
  assert.equal(normalizeCellText("  Наименование\nработ  "), "Наименование работ");
});

test("parses OCR text fallback table lines", () => {
  assert.deepEqual(parseOcrTextTable("№  Наименование  Кол-во\n1  Выемка  45"), [
    ["№", "Наименование", "Кол-во"],
    ["1", "Выемка", "45"],
  ]);
});
