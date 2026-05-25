export function scoreTable(rows) {
  if (!rows?.length) {
    return 0;
  }

  const widths = rows.map((row) => row.length);
  const maxWidth = Math.max(...widths);
  const nonEmptyCells = rows.flat().filter((value) => String(value || "").trim()).length;
  const multiCellRows = widths.filter((width) => width >= 2).length;
  const widthStability = mostCommonCount(widths) / widths.length;
  const density = nonEmptyCells / Math.max(1, rows.length * maxWidth);
  const compactWidth = maxWidth <= 6 ? Math.min(1, maxWidth / 4) : Math.max(0, 1 - (maxWidth - 6) * 0.2);

  const baseScore =
    Math.min(1, rows.length / 8) * 0.25
      + compactWidth * 0.2
      + (multiCellRows / rows.length) * 0.25
      + widthStability * 0.2
      + density * 0.1;
  const widthPenalty = maxWidth > 6 ? 0.45 : 1;
  const densityPenalty = 0.35 + density * 0.65;

  return roundScore(baseScore * widthPenalty * densityPenalty);
}

export function chooseBestTable(candidates) {
  return candidates
    .filter((candidate) => candidate.rows?.length)
    .map((candidate) => {
      const score = Math.min(1, scoreTable(candidate.rows) + (candidate.scoreBonus || 0));
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score)[0] || { rows: [], score: 0, strategy: "empty" };
}

function mostCommonCount(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Math.max(0, ...counts.values());
}

function roundScore(value) {
  return Math.round(value * 1000) / 1000;
}
