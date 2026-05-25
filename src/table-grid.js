import { buildMergedCellsFromSeparators } from "./merged-cells.js";

export function detectTableGrid(imageData, width, height) {
  const horizontalLines = chooseLineSet(
    filterLinesBySpacing(groupLineRuns(scanRows(imageData, width, height), 8), 14),
    filterLinesBySpacing(groupLineRuns(scanHorizontalGradients(imageData, width, height), 4), 14),
  );
  const verticalLines = chooseLineSet(
    filterLinesBySpacing(groupLineRuns(scanColumns(imageData, width, height), 8), 20),
    filterLinesBySpacing(groupLineRuns(scanVerticalGradients(imageData, width, height), 4), 20),
  );
  const enrichedHorizontalLines = mergeLineSets(
    horizontalLines,
    filterLinesBySpacing(groupLineRuns(scanPartialRows(imageData, width, height), 4), 14),
    8,
  );
  const enrichedVerticalLines = mergeLineSets(
    verticalLines,
    filterLinesBySpacing(groupLineRuns(scanPartialColumns(imageData, width, height), 4), 20),
    8,
  );

  if (enrichedHorizontalLines.length < 2 || enrichedVerticalLines.length < 2) {
    return { cells: [], rows: 0, cols: 0 };
  }

  const cells = [];
  for (let row = 0; row < enrichedHorizontalLines.length - 1; row++) {
    const y1 = enrichedHorizontalLines[row];
    const y2 = enrichedHorizontalLines[row + 1];
    if (y2 - y1 < 16) {
      continue;
    }

    for (let col = 0; col < enrichedVerticalLines.length - 1; col++) {
      const x1 = enrichedVerticalLines[col];
      const x2 = enrichedVerticalLines[col + 1];
      if (x2 - x1 < 24) {
        continue;
      }

      cells.push({ row, col, x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    }
  }

  const separatorMap = buildSeparatorMap(imageData, width, height, enrichedHorizontalLines, enrichedVerticalLines);
  const mergedCells = buildMergedCellsFromSeparators({
    rows: enrichedHorizontalLines.length - 1,
    cols: enrichedVerticalLines.length - 1,
    verticalSeparators: separatorMap.verticalSeparators,
    horizontalSeparators: separatorMap.horizontalSeparators,
  }).map((cell) => ({
    ...cell,
    x: enrichedVerticalLines[cell.col],
    y: enrichedHorizontalLines[cell.row],
    width: enrichedVerticalLines[cell.col + cell.colSpan] - enrichedVerticalLines[cell.col],
    height: enrichedHorizontalLines[cell.row + cell.rowSpan] - enrichedHorizontalLines[cell.row],
  }));

  const limitedCells = cells.slice(0, 240);
  const rows = countUnique(limitedCells.map((cell) => cell.row));
  const cols = countUnique(limitedCells.map((cell) => cell.col));

  return { cells: limitedCells, mergedCells: mergedCells.slice(0, 240), rows, cols, separatorMap };
}

export function formatGridDetectionMessage(grid) {
  if (!grid || !grid.cells.length) {
    return "Чёткая сетка таблицы не найдена.";
  }

  return `Найдено строк: ${grid.rows}, столбцов: ${grid.cols}, ячеек: ${grid.cells.length}.`;
}

function scanRows(data, width, height) {
  const rows = [];
  const minDarkPixels = Math.max(40, width * 0.22);

  for (let y = 0; y < height; y++) {
    let darkPixels = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 20) {
        darkPixels++;
      }
    }

    if (darkPixels >= minDarkPixels) {
      rows.push(y);
    }
  }

  return rows;
}

function scanColumns(data, width, height) {
  const columns = [];
  const minDarkPixels = Math.max(40, height * 0.14);

  for (let x = 0; x < width; x++) {
    let darkPixels = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (data[i] < 20) {
        darkPixels++;
      }
    }

    if (darkPixels >= minDarkPixels) {
      columns.push(x);
    }
  }

  return columns;
}

function scanPartialRows(data, width, height) {
  return scanLinePixels(data, width, height, "horizontal", Math.max(16, width * 0.18));
}

function scanPartialColumns(data, width, height) {
  return scanLinePixels(data, width, height, "vertical", Math.max(16, height * 0.24));
}

function scanLinePixels(data, width, height, direction, minPixels) {
  const indices = [];
  const horizontal = direction === "horizontal";
  const outerLimit = horizontal ? height : width;
  const innerLimit = horizontal ? width : height;

  for (let outer = 0; outer < outerLimit; outer++) {
    let pixels = 0;
    for (let inner = 0; inner < innerLimit; inner++) {
      const x = horizontal ? inner : outer;
      const y = horizontal ? outer : inner;
      const i = (y * width + x) * 4;
      if (data[i] < 20) {
        pixels++;
      }
    }

    if (pixels >= minPixels) {
      indices.push(outer);
    }
  }

  return indices;
}

function buildSeparatorMap(data, width, height, horizontalLines, verticalLines) {
  const rowCount = horizontalLines.length - 1;
  const colCount = verticalLines.length - 1;
  const verticalSeparators = Array.from({ length: rowCount }, () => Array.from({ length: colCount + 1 }, () => true));
  const horizontalSeparators = Array.from({ length: rowCount + 1 }, () => Array.from({ length: colCount }, () => true));

  for (let row = 0; row < rowCount; row++) {
    const y1 = horizontalLines[row];
    const y2 = horizontalLines[row + 1];
    for (let boundary = 1; boundary < colCount; boundary++) {
      verticalSeparators[row][boundary] = hasVerticalSegment(data, width, height, verticalLines[boundary], y1, y2);
    }
  }

  for (let boundary = 1; boundary < rowCount; boundary++) {
    const y = horizontalLines[boundary];
    for (let col = 0; col < colCount; col++) {
      horizontalSeparators[boundary][col] = hasHorizontalSegment(data, width, height, y, verticalLines[col], verticalLines[col + 1]);
    }
  }

  return { verticalSeparators, horizontalSeparators };
}

function hasVerticalSegment(data, width, height, x, y1, y2) {
  const top = clamp(Math.min(y1, y2) + 2, 0, height - 1);
  const bottom = clamp(Math.max(y1, y2) - 2, 0, height - 1);
  const length = Math.max(1, bottom - top + 1);
  let hits = 0;

  for (let y = top; y <= bottom; y++) {
    if (isLinePixelNear(data, width, height, x, y, "vertical")) {
      hits++;
    }
  }

  return hits / length >= 0.32;
}

function hasHorizontalSegment(data, width, height, y, x1, x2) {
  const left = clamp(Math.min(x1, x2) + 2, 0, width - 1);
  const right = clamp(Math.max(x1, x2) - 2, 0, width - 1);
  const length = Math.max(1, right - left + 1);
  let hits = 0;

  for (let x = left; x <= right; x++) {
    if (isLinePixelNear(data, width, height, x, y, "horizontal")) {
      hits++;
    }
  }

  return hits / length >= 0.32;
}

function isLinePixelNear(data, width, height, x, y, direction) {
  for (let offset = -1; offset <= 1; offset++) {
    const px = direction === "vertical" ? clamp(x + offset, 0, width - 1) : x;
    const py = direction === "horizontal" ? clamp(y + offset, 0, height - 1) : y;
    const current = grayAt(data, width, px, py);
    if (current < 90) {
      return true;
    }

    if (direction === "vertical") {
      const previous = grayAt(data, width, clamp(px - 1, 0, width - 1), py);
      const next = grayAt(data, width, clamp(px + 1, 0, width - 1), py);
      if (Math.abs(next - previous) >= 18) {
        return true;
      }
    } else {
      const previous = grayAt(data, width, px, clamp(py - 1, 0, height - 1));
      const next = grayAt(data, width, px, clamp(py + 1, 0, height - 1));
      if (Math.abs(next - previous) >= 18) {
        return true;
      }
    }
  }

  return false;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scanHorizontalGradients(data, width, height) {
  const rows = [];
  const minGradientPixels = Math.max(40, width * 0.22);

  for (let y = 1; y < height - 1; y++) {
    let gradientPixels = 0;
    for (let x = 0; x < width; x++) {
      const current = grayAt(data, width, x, y);
      const previous = grayAt(data, width, x, y - 1);
      const next = grayAt(data, width, x, y + 1);
      if (Math.abs(next - previous) >= 18 || current < 80) {
        gradientPixels++;
      }
    }

    if (gradientPixels >= minGradientPixels) {
      rows.push(y);
    }
  }

  return rows;
}

function scanVerticalGradients(data, width, height) {
  const columns = [];
  const minGradientPixels = Math.max(40, height * 0.2);

  for (let x = 1; x < width - 1; x++) {
    let gradientPixels = 0;
    for (let y = 0; y < height; y++) {
      const current = grayAt(data, width, x, y);
      const previous = grayAt(data, width, x - 1, y);
      const next = grayAt(data, width, x + 1, y);
      if (Math.abs(next - previous) >= 18 || current < 80) {
        gradientPixels++;
      }
    }

    if (gradientPixels >= minGradientPixels) {
      columns.push(x);
    }
  }

  return columns;
}

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4;
  return Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
}

function groupLineRuns(indices, maxGap) {
  if (!indices.length) {
    return [];
  }

  const groups = [];
  let start = indices[0];
  let end = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const value = indices[i];
    if (value - end <= maxGap) {
      end = value;
      continue;
    }

    groups.push(Math.round((start + end) / 2));
    start = value;
    end = value;
  }

  groups.push(Math.round((start + end) / 2));
  return groups;
}

function filterLinesBySpacing(lines, minGap) {
  if (lines.length < 2) {
    return lines;
  }

  const filtered = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const previous = filtered[filtered.length - 1];
    const current = lines[i];

    if (current - previous >= minGap) {
      filtered.push(current);
      continue;
    }

    filtered[filtered.length - 1] = Math.round((previous + current) / 2);
  }

  return filtered;
}

function chooseLineSet(primary, fallback) {
  if (fallback.length > primary.length + 1) {
    return fallback;
  }

  return primary;
}

function mergeLineSets(primary, secondary, maxDistance) {
  const merged = [...primary];
  for (const line of secondary) {
    const existingIndex = merged.findIndex((candidate) => Math.abs(candidate - line) <= maxDistance);
    if (existingIndex >= 0) {
      merged[existingIndex] = Math.round((merged[existingIndex] + line) / 2);
    } else {
      merged.push(line);
    }
  }

  return merged.sort((a, b) => a - b);
}

function countUnique(values) {
  return new Set(values).size;
}
