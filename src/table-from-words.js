import { normalizeCellText } from "./ocr-config.js";

export function buildTableFromWords(words, options = {}) {
  const normalizedWords = normalizeWords(words);
  if (!normalizedWords.length) {
    return [];
  }

  const rows = groupWordsIntoRows(normalizedWords, options.rowTolerance ?? 0.65);
  const rowSegments = rows.map((row) => groupWordsIntoSegments(row, options.segmentGap ?? 18));
  const columns = inferColumns(rowSegments, options.columnTolerance ?? 32);

  if (!rowSegments.length || !columns.length) {
    return [];
  }

  return rowSegments.map((row) => buildRow(row, columns));
}

function normalizeWords(words) {
  return (words || [])
    .map((word) => {
      const text = normalizeCellText(word.text);
      const bbox = word.bbox || word;
      const x0 = Number(bbox.x0);
      const y0 = Number(bbox.y0);
      const x1 = Number(bbox.x1);
      const y1 = Number(bbox.y1);

      if (!text || !Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
        return null;
      }

      return {
        text,
        x0,
        y0,
        x1,
        y1,
        centerX: (x0 + x1) / 2,
        centerY: (y0 + y1) / 2,
        height: Math.max(1, y1 - y0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.centerY - b.centerY || a.x0 - b.x0);
}

function groupWordsIntoRows(words, toleranceFactor) {
  const rows = [];

  for (const word of words) {
    const row = rows.find((candidate) => {
      const tolerance = Math.max(word.height, candidate.height) * toleranceFactor;
      return Math.abs(candidate.centerY - word.centerY) <= tolerance;
    });

    if (row) {
      row.words.push(word);
      row.centerY = average(row.words.map((item) => item.centerY));
      row.height = average(row.words.map((item) => item.height));
    } else {
      rows.push({ centerY: word.centerY, height: word.height, words: [word] });
    }
  }

  return rows
    .map((row) => row.words.sort((a, b) => a.x0 - b.x0))
    .sort((a, b) => average(a.map((word) => word.centerY)) - average(b.map((word) => word.centerY)));
}

function groupWordsIntoSegments(words, maxGap) {
  if (!words.length) {
    return [];
  }

  const segments = [];
  let current = createSegment(words[0]);

  for (const word of words.slice(1)) {
    const gap = word.x0 - current.x1;
    if (gap <= maxGap) {
      current.words.push(word);
      current.text = `${current.text} ${word.text}`;
      current.x1 = Math.max(current.x1, word.x1);
      current.centerX = (current.x0 + current.x1) / 2;
      continue;
    }

    segments.push(current);
    current = createSegment(word);
  }

  segments.push(current);
  return segments;
}

function createSegment(word) {
  return {
    text: word.text,
    words: [word],
    x0: word.x0,
    x1: word.x1,
    centerX: word.centerX,
  };
}

function inferColumns(rows, tolerance) {
  const anchors = [];
  const starts = rows.flatMap((row) => row.map((segment) => segment.x0)).sort((a, b) => a - b);

  for (const start of starts) {
    const anchor = anchors.find((value) => Math.abs(value - start) <= tolerance);
    if (anchor === undefined) {
      anchors.push(start);
      continue;
    }

    const index = anchors.indexOf(anchor);
    anchors[index] = (anchor + start) / 2;
  }

  return anchors.sort((a, b) => a - b);
}

function buildRow(segments, columns) {
  const cells = Array.from({ length: columns.length }, () => []);

  for (const segment of segments) {
    const columnIndex = nearestColumnIndex(columns, segment.x0);
    cells[columnIndex].push(segment.text);
  }

  return trimTrailingEmptyCells(cells.map((cell) => cell.join(" ")));
}

function nearestColumnIndex(columns, x) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < columns.length; index++) {
    const distance = Math.abs(columns[index] - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function trimTrailingEmptyCells(row) {
  const nextRow = [...row];
  while (nextRow.length > 1 && !nextRow[nextRow.length - 1]) {
    nextRow.pop();
  }
  return nextRow;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
