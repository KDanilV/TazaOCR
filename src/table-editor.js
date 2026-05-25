export function normalizeTableRows(rows) {
  if (!rows.length) {
    return [[""]];
  }

  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  return rows.map((row) => {
    const normalized = [...row];
    while (normalized.length < columnCount) {
      normalized.push("");
    }
    return normalized;
  });
}

export function insertRowAfter(rows, rowIndex) {
  const nextRows = normalizeTableRows(rows);
  const columnCount = Math.max(...nextRows.map((row) => row.length), 1);
  nextRows.splice(rowIndex + 1, 0, Array.from({ length: columnCount }, () => ""));
  return nextRows;
}

export function deleteRowAt(rows, rowIndex) {
  const nextRows = normalizeTableRows(rows);
  if (nextRows.length <= 1) {
    return nextRows;
  }

  nextRows.splice(rowIndex, 1);
  return nextRows;
}

export function insertColumnAfter(rows, colIndex) {
  const nextRows = normalizeTableRows(rows);
  for (const row of nextRows) {
    row.splice(colIndex + 1, 0, "");
  }
  return nextRows;
}

export function deleteColumnAt(rows, colIndex) {
  const nextRows = normalizeTableRows(rows);
  const columnCount = Math.max(...nextRows.map((row) => row.length), 1);
  if (columnCount <= 1) {
    return nextRows;
  }

  for (const row of nextRows) {
    row.splice(colIndex, 1);
  }
  return nextRows;
}
