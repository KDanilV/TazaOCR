export const DEFAULT_OCR_LANGUAGE = "rus";

export function getTesseractOptions(overrides = {}) {
  return {
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
    ...overrides,
  };
}

export function normalizeOcrText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function normalizeCellText(value) {
  return normalizeOcrText(value).replace(/\n+/g, " ");
}

export function parseOcrTextTable(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, "  ").trim())
    .filter(Boolean)
    .map(splitOcrLine);
}

function splitOcrLine(line) {
  const spacedColumns = line.split(/\s{2,}/).map((value) => value.trim()).filter(Boolean);
  if (spacedColumns.length > 1) {
    return spacedColumns;
  }

  return [line];
}
