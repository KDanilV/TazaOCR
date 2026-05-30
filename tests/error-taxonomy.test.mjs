import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const python = findPython();
const canRunPythonClassifier = python && canImportClassifier(python);

test("classifies OCR table mismatches by likely cause", { skip: !canRunPythonClassifier }, () => {
  const payload = runPythonClassifier(`
summary = classify_sheet(
    "sample",
    [
        ["№", "наименование", "кол-во", "примечание"],
        ["1", "выемка", "45", ""],
        ["2", "засыпка", "12", "ok"],
        ["3", "общая сумма", "", ""],
        ["4", "road", "", ""],
    ],
    [
        ["№", "name!!!", "кол-во", "примечание"],
        ["1", "выемка", "", "45"],
        ["2", "ok", "12", "засыпка"],
        ["3", "общая", "сумма", ""],
        ["4", "roacl", "", "extra"],
        ["5", "лишняя", "", ""],
    ],
    top_error_limit=20,
)
print(json.dumps(summary_to_json(summary), ensure_ascii=False))
`);

  assert.equal(payload.file, "sample");
  assert.equal(payload.totalComparedCells, 20);
  assert.equal(payload.exactMatches, 9);
  assert.equal(payload.mismatchCount, 11);
  assert.ok(payload.errorBreakdown.ocr_text_error >= 1);
  assert.ok(payload.errorBreakdown.missing_numeric_value >= 1);
  assert.ok(payload.errorBreakdown.wrong_column >= 1);
  assert.ok(payload.errorBreakdown.empty_cell_shift >= 1);
  assert.ok(payload.errorBreakdown.merge_split_issue >= 1);
  assert.ok(payload.errorBreakdown.cyrillic_ocr_garbage >= 1);
  assert.equal(payload.errorBreakdown.extra_row, 1);
  assert.ok(payload.topErrors.some((error) => error.row === 2 && error.column === 3 && error.expected === "45"));
  assert.ok(payload.topErrors.some((error) => error.category === "cyrillic_ocr_garbage" && error.row === 1 && error.column === 2));
});

test("reports a missing actual sheet as missing rows and cells", { skip: !canRunPythonClassifier }, () => {
  const payload = runPythonClassifier(`
summary = classify_sheet("missing", [["a", "10"], ["b", ""]], None, top_error_limit=5)
print(json.dumps(summary_to_json(summary), ensure_ascii=False))
`);

  assert.equal(payload.status, "missing");
  assert.equal(payload.totalComparedCells, 3);
  assert.equal(payload.exactMatches, 0);
  assert.equal(payload.mismatchCount, 3);
  assert.equal(payload.errorBreakdown.missing_row, 2);
  assert.equal(payload.errorBreakdown.missing_cell, 3);
  assert.equal(payload.errorBreakdown.missing_numeric_value, 1);
  assert.equal(payload.suspectedMainCause, "missing_cell");
  assert.equal(payload.topErrors[0].row, 1);
  assert.equal(payload.topErrors[0].column, 1);
});

function runPythonClassifier(body) {
  const code = `
import json
import sys
sys.path.insert(0, "scripts")
from compare_error_taxonomy import classify_sheet, summary_to_json
${body}
`;
  return JSON.parse(execFileSync(python, ["-c", code], { encoding: "utf8" }));
}

function findPython() {
  for (const candidate of ["python", "py"]) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function canImportClassifier(command) {
  try {
    execFileSync(command, ["-c", "import sys; sys.path.insert(0, 'scripts'); import compare_error_taxonomy"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
