import assert from "node:assert/strict";
import test from "node:test";

import { chooseBestTable, scoreTable } from "../src/extraction-quality.js";

test("scores empty tables as zero", () => {
  assert.equal(scoreTable([]), 0);
});

test("scores structured tables higher than single-column text", () => {
  const structured = [
    ["№", "Name", "Qty"],
    ["1", "Work", "45"],
    ["2", "Backfill", "20"],
  ];
  const textOnly = [["line one"], ["line two"], ["line three"]];

  assert.ok(scoreTable(structured) > scoreTable(textOnly));
});

test("chooses the highest scoring table candidate", () => {
  const best = chooseBestTable([
    { strategy: "text", rows: [["line one"], ["line two"]] },
    { strategy: "words", rows: [["№", "Name"], ["1", "Work"]] },
  ]);

  assert.equal(best.strategy, "words");
});

test("applies candidate score bonuses", () => {
  const best = chooseBestTable([
    { strategy: "text", rows: [["line one"], ["line two"]] },
    { strategy: "preset", rows: [["line one"], ["line two"]], scoreBonus: 0.2 },
  ]);

  assert.equal(best.strategy, "preset");
});

test("penalizes overly fragmented wide tables", () => {
  const fragmented = [
    ["", "", "Name", "", "Qty", "Note", "", ""],
    ["1 Work", "", "", "", "45", "x", "", ""],
  ];
  const compact = [
    ["№", "Name", "Qty", "Note"],
    ["1", "Work", "45", "x"],
  ];

  assert.ok(scoreTable(compact) > scoreTable(fragmented));
});
