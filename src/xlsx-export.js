const INVALID_SHEET_NAME_CHARS = /[\][*?/\\:]/g;
const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MAX_SHEET_NAME_LENGTH = 31;

export function createSafeSheetName(value, fallback = "OCR Result") {
  const normalized = String(value || "")
    .replace(INVALID_SHEET_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || fallback).slice(0, MAX_SHEET_NAME_LENGTH);
}

export function createExportFileName(sourceName) {
  const baseName = String(sourceName || "scan")
    .replace(/\.[^.]+$/, "")
    .replace(INVALID_FILE_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${baseName || "scan"}-ocr.xlsx`;
}

export function calculateColumnWidths(rows, options = {}) {
  const minWidth = options.minWidth ?? 8;
  const maxWidth = options.maxWidth ?? 42;
  const padding = options.padding ?? 2;
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, () => minWidth);

  for (const row of rows) {
    row.forEach((cell, columnIndex) => {
      const longestLine = String(cell ?? "")
        .split(/\r?\n/)
        .reduce((max, line) => Math.max(max, line.length), 0);
      widths[columnIndex] = Math.min(maxWidth, Math.max(widths[columnIndex], longestLine + padding));
    });
  }

  return widths.map((width) => ({ wch: width }));
}

export function buildMetadataRows(metadata) {
  const rows = [
    ["Source file", metadata.sourceFile || ""],
    ["Mode", metadata.mode || ""],
    ["OCR language", metadata.language || ""],
    ["PDF page", metadata.pdfPage || ""],
    ["Exported at", metadata.exportedAt || ""],
  ];

  if (metadata.rowCount !== undefined) {
    rows.push(["Rows", metadata.rowCount]);
  }

  if (metadata.columnCount !== undefined) {
    rows.push(["Columns", metadata.columnCount]);
  }

  return rows;
}

export function formatWorksheet(worksheet, rows) {
  worksheet["!cols"] = calculateColumnWidths(rows);

  for (const cellAddress of Object.keys(worksheet)) {
    if (cellAddress.startsWith("!")) {
      continue;
    }

    const cell = worksheet[cellAddress];
    if (typeof cell.v === "string" && cell.v.includes("\n")) {
      cell.s = {
        ...(cell.s || {}),
        alignment: {
          ...(cell.s?.alignment || {}),
          vertical: "top",
          wrapText: true,
        },
      };
    }
  }

  return worksheet;
}

export function buildRowsAndMergesFromCells(cells) {
  const normalizedCells = (cells || []).map((cell) => ({
    row: Math.max(0, Number(cell.row) || 0),
    col: Math.max(0, Number(cell.col) || 0),
    rowSpan: Math.max(1, Number(cell.rowSpan) || 1),
    colSpan: Math.max(1, Number(cell.colSpan) || 1),
    text: cell.text ?? "",
  }));
  const rowCount = normalizedCells.reduce((max, cell) => Math.max(max, cell.row + cell.rowSpan), 0);
  const colCount = normalizedCells.reduce((max, cell) => Math.max(max, cell.col + cell.colSpan), 0);
  const rows = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ""));
  const merges = [];

  for (const cell of normalizedCells) {
    rows[cell.row][cell.col] = cell.text;
    if (cell.rowSpan > 1 || cell.colSpan > 1) {
      merges.push({
        s: { r: cell.row, c: cell.col },
        e: { r: cell.row + cell.rowSpan - 1, c: cell.col + cell.colSpan - 1 },
      });
    }
  }

  return { rows, merges };
}

export function buildWorkbook(XLSX, options) {
  const workbook = XLSX.utils.book_new();
  const table = options.cells ? buildRowsAndMergesFromCells(options.cells) : { rows: options.rows, merges: [] };
  const worksheet = XLSX.utils.aoa_to_sheet(table.rows);
  formatWorksheet(worksheet, table.rows);
  if (table.merges.length) {
    worksheet["!merges"] = table.merges;
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, createSafeSheetName(options.sheetName));

  if (options.metadataRows?.length) {
    const metadataWorksheet = XLSX.utils.aoa_to_sheet(options.metadataRows);
    formatWorksheet(metadataWorksheet, options.metadataRows);
    XLSX.utils.book_append_sheet(workbook, metadataWorksheet, "Metadata");
  }

  return workbook;
}
