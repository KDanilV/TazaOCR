export function buildMergedCellsFromSeparators(options) {
  const rowCount = Math.max(0, Number(options.rows) || 0);
  const colCount = Math.max(0, Number(options.cols) || 0);
  const values = options.values || [];
  const visited = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => false));
  const cells = [];

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      if (visited[row][col]) {
        continue;
      }

      const span = findSpan(row, col, rowCount, colCount, options);
      for (let r = row; r < row + span.rowSpan; r++) {
        for (let c = col; c < col + span.colSpan; c++) {
          visited[r][c] = true;
        }
      }

      cells.push({
        row,
        col,
        rowSpan: span.rowSpan,
        colSpan: span.colSpan,
        text: values[row]?.[col] ?? "",
      });
    }
  }

  return cells;
}

function findSpan(row, col, rowCount, colCount, options) {
  let rowSpan = 1;
  let colSpan = 1;
  let expanded = true;

  while (expanded) {
    expanded = false;

    while (col + colSpan < colCount && canExpandRight(row, col, rowSpan, colSpan, options)) {
      colSpan++;
      expanded = true;
    }

    while (row + rowSpan < rowCount && canExpandDown(row, col, rowSpan, colSpan, options)) {
      rowSpan++;
      expanded = true;
    }
  }

  return { rowSpan, colSpan };
}

function canExpandRight(row, col, rowSpan, colSpan, options) {
  const boundary = col + colSpan;
  for (let r = row; r < row + rowSpan; r++) {
    if (hasVerticalSeparator(options, r, boundary)) {
      return false;
    }
  }

  return true;
}

function canExpandDown(row, col, rowSpan, colSpan, options) {
  const boundary = row + rowSpan;
  for (let c = col; c < col + colSpan; c++) {
    if (hasHorizontalSeparator(options, boundary, c)) {
      return false;
    }
  }

  return true;
}

function hasVerticalSeparator(options, row, boundary) {
  if (boundary <= 0 || boundary >= options.cols) {
    return true;
  }

  return options.verticalSeparators?.[row]?.[boundary] !== false;
}

function hasHorizontalSeparator(options, boundary, col) {
  if (boundary <= 0 || boundary >= options.rows) {
    return true;
  }

  return options.horizontalSeparators?.[boundary]?.[col] !== false;
}
