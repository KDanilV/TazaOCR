import { normalizeOcrText } from "../ocr-config.js";

export function parseVedomostTextTable(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, "  ").trim())
    .filter(Boolean)
    .map(parseVedomostLine);
}

export function parseVedomostLine(line) {
  const cleaned = normalizeOcrText(line)
    .replace(/[|_[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();

  if (lower.includes("наименование") || lower.includes("кол-во") || lower.includes("примечание")) {
    return ["№", "Наименование", "Ед.изм", "Кол-во", "Примечание"];
  }

  const numbered = cleaned.match(/^(\d{1,2})\s+(.+)$/);
  if (!numbered) {
    return [cleaned];
  }

  const number = numbered[1];
  const tokens = numbered[2].split(" ").filter(Boolean);
  if (tokens.length < 2) {
    return [number, numbered[2], "", "", ""];
  }

  const quantityIndex = findQuantityIndex(tokens);
  const unitIndex = findUnitIndex(tokens, quantityIndex);
  const nameEnd = unitIndex >= 0 ? unitIndex : quantityIndex >= 0 ? quantityIndex : tokens.length;
  const name = tokens.slice(0, nameEnd).join(" ");
  const unit = unitIndex >= 0 ? normalizeUnit(tokens[unitIndex]) : "";
  const quantity = quantityIndex >= 0 ? normalizeQuantity(tokens[quantityIndex]) : "";
  const noteStart = quantityIndex >= 0 ? quantityIndex + 1 : tokens.length;
  const note = tokens.slice(noteStart).join(" ");

  return [number, name, unit, quantity, note];
}

function findQuantityIndex(tokens) {
  for (let index = tokens.length - 1; index >= 0; index--) {
    if (!/^[\d,.\s]+$/.test(tokens[index])) {
      continue;
    }

    if (/^\d+[,.]?\d*$/.test(normalizeQuantity(tokens[index]))) {
      return index;
    }
  }

  return -1;
}

function findUnitIndex(tokens, quantityIndex) {
  const end = quantityIndex >= 0 ? quantityIndex : tokens.length;
  for (let index = Math.max(0, end - 3); index < end; index++) {
    if (normalizeUnit(tokens[index])) {
      return index;
    }
  }

  return -1;
}

function normalizeUnit(value) {
  const normalized = value.toLowerCase().replace(/[.,;:]+$/g, "");
  if (/^(м3|m3|мз|mз|м")$/.test(normalized)) {
    return "м3";
  }

  if (/^(м2|m2|мг|mг)$/.test(normalized)) {
    return "м2";
  }

  if (/^(кг|kr|ko|кг\.?)$/.test(normalized)) {
    return "кг";
  }

  if (/^(шт|шт\.|uum|um|шm)$/.test(normalized)) {
    return "шт.";
  }

  if (/^(п\.?м\.?|n\.?m\.?|пм)$/.test(normalized)) {
    return "п.м.";
  }

  if (/^(м|m)$/.test(normalized)) {
    return "м";
  }

  return "";
}

function normalizeQuantity(value) {
  return value.replace(/[^\d,.]/g, "").replace(".", ",");
}
