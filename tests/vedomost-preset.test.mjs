import assert from "node:assert/strict";
import test from "node:test";

import { parseVedomostTextTable } from "../src/presets/vedomost.js";

test("parses numbered ведомость rows into five columns", () => {
  assert.deepEqual(parseVedomostTextTable("1 Выемка м3 45 Пер."), [["1", "Выемка", "м3", "45", "Пер."]]);
});

test("does not use note counts as quantity", () => {
  assert.deepEqual(parseVedomostTextTable("8 Футляр стальная тр. кг 26 2-шт"), [
    ["8", "Футляр стальная тр.", "кг", "26", "2-шт"],
  ]);
});

test("normalizes ведомость header", () => {
  assert.deepEqual(parseVedomostTextTable("№ Наименование Кол-во"), [
    ["№", "Наименование", "Ед.изм", "Кол-во", "Примечание"],
  ]);
});
