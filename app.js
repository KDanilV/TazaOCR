import { detectTableGrid, formatGridDetectionMessage } from "./src/table-grid.js";
import {
  deleteColumnAt,
  deleteRowAt,
  insertColumnAfter,
  insertRowAfter,
  normalizeTableRows,
} from "./src/table-editor.js";
import {
  DEFAULT_OCR_LANGUAGE,
  getTesseractOptions,
  normalizeCellText,
  normalizeOcrText,
  parseOcrTextTable,
} from "./src/ocr-config.js";
import { parseVedomostTextTable } from "./src/presets/vedomost.js";
import { buildTableFromWords } from "./src/table-from-words.js";
import { chooseBestTable } from "./src/extraction-quality.js";
import { createPerspectiveTransform, getQuadOutputSize, orderQuadPoints } from "./src/perspective.js";
import {
  buildMetadataRows,
  buildRowsAndMergesFromCells,
  buildWorkbook,
  createExportFileName,
  createSafeSheetName,
} from "./src/xlsx-export.js";

const imageInput = document.querySelector("#imageInput");
const fileName = document.querySelector("#fileName");
const languageSelect = document.querySelector("#languageSelect");
const pdfPageField = document.querySelector("#pdfPageField");
const pdfPageSelect = document.querySelector("#pdfPageSelect");
const rotateLeftButton = document.querySelector("#rotateLeftButton");
const rotateRightButton = document.querySelector("#rotateRightButton");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdValue = document.querySelector("#thresholdValue");
const deskewInput = document.querySelector("#deskewInput");
const deskewValue = document.querySelector("#deskewValue");
const useSelectionButton = document.querySelector("#useSelectionButton");
const perspectiveModeButton = document.querySelector("#perspectiveModeButton");
const applyPerspectiveButton = document.querySelector("#applyPerspectiveButton");
const resetScanButton = document.querySelector("#resetScanButton");
const preprocessButton = document.querySelector("#preprocessButton");
const recognizeTableButton = document.querySelector("#recognizeTableButton");
const recognizeButton = document.querySelector("#recognizeButton");
const exportButton = document.querySelector("#exportButton");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const statusBox = document.querySelector("#status");
const canvas = document.querySelector("#imageCanvas");
const emptyCanvas = document.querySelector("#emptyCanvas");
const gridOverlay = document.querySelector("#gridOverlay");
const cornerOverlay = document.querySelector("#cornerOverlay");
const selectionBox = document.querySelector("#selectionBox");
const editorToolbar = document.querySelector("#editorToolbar");
const insertRowButton = document.querySelector("#insertRowButton");
const deleteRowButton = document.querySelector("#deleteRowButton");
const insertColumnButton = document.querySelector("#insertColumnButton");
const deleteColumnButton = document.querySelector("#deleteColumnButton");
const mergeRightButton = document.querySelector("#mergeRightButton");
const mergeDownButton = document.querySelector("#mergeDownButton");
const splitCellButton = document.querySelector("#splitCellButton");
const tableWrap = document.querySelector("#tableWrap");
const ocrOutput = document.querySelector("#ocrOutput");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const originalCanvas = document.createElement("canvas");
const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d", { willReadFrequently: true });

let hasImage = false;
let pdfDocument = null;
let selectionStart = null;
let selectionRect = null;
let detectedCells = [];
let detectedGrid = null;
let tableData = [];
let structuredTableCells = [];
let activeCell = null;
let currentFileName = "";
let perspectiveMode = false;
let perspectivePoints = [];

languageSelect.value = DEFAULT_OCR_LANGUAGE;

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) {
    return;
  }

  resetResults();
  pdfDocument = null;
  resetPdfPageSelect();
  currentFileName = file.name;
  fileName.textContent = currentFileName;
  setStatus("Загрузка скана");
  setProgress(0, "Читаем файл...");

  try {
    if (isPdfFile(file)) {
      await loadPdfFile(file);
    } else {
      await drawImageFile(file);
    }

    storeOriginalCanvas();
    storeSourceCanvas();
    hasImage = true;
    resetScanButton.disabled = false;
    rotateLeftButton.disabled = false;
    rotateRightButton.disabled = false;
    thresholdInput.disabled = false;
    deskewInput.disabled = false;
    perspectiveModeButton.disabled = false;
    preprocessButton.disabled = false;
    recognizeButton.disabled = false;
    setStatus("Готово");
    setProgress(0, "Скан загружен.");
  } catch (error) {
    hasImage = false;
    setButtonsDisabled(true);
    setStatus("Ошибка загрузки", true);
    setProgress(0, "Не удалось загрузить этот файл.");
    console.error(error);
  }
});

pdfPageSelect.addEventListener("change", async () => {
  if (!pdfDocument) {
    return;
  }

  resetTable();
  clearSelection();
  clearGridOverlay();
  ocrOutput.value = "";
  exportButton.disabled = true;
  recognizeTableButton.disabled = true;
  setButtonsDisabled(true);
  setStatus("Загрузка страницы");
  setProgress(0, `Отрисовываем страницу ${pdfPageSelect.value}...`);

  try {
    await renderPdfPage(Number(pdfPageSelect.value));
    storeOriginalCanvas();
    storeSourceCanvas();
    hasImage = true;
    resetScanButton.disabled = false;
    rotateLeftButton.disabled = false;
    rotateRightButton.disabled = false;
    thresholdInput.disabled = false;
    deskewInput.disabled = false;
    perspectiveModeButton.disabled = false;
    preprocessButton.disabled = false;
    recognizeButton.disabled = false;
    setStatus("Готово");
    setProgress(0, `Страница PDF ${pdfPageSelect.value} загружена.`);
  } catch (error) {
    hasImage = false;
    setStatus("Ошибка PDF", true);
    setProgress(0, "Не удалось отрисовать эту страницу PDF.");
    console.error(error);
  }
});

rotateLeftButton.addEventListener("click", () => {
  rotateWorkingImage(-90);
});

rotateRightButton.addEventListener("click", () => {
  rotateWorkingImage(90);
});

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = thresholdInput.value;
});

deskewInput.addEventListener("input", () => {
  deskewValue.textContent = `${Number(deskewInput.value).toFixed(1)}°`;
});

canvas.addEventListener("pointerdown", (event) => {
  if (!hasImage) {
    return;
  }

  if (perspectiveMode) {
    addPerspectivePoint(getCanvasPoint(event));
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  selectionStart = getCanvasPoint(event);
  selectionRect = null;
  useSelectionButton.disabled = true;
  selectionBox.hidden = false;
  updateSelectionBox(selectionStart, selectionStart);
});

canvas.addEventListener("pointermove", (event) => {
  if (!selectionStart) {
    return;
  }

  updateSelectionBox(selectionStart, getCanvasPoint(event));
});

canvas.addEventListener("pointerup", (event) => {
  if (!selectionStart) {
    return;
  }

  const end = getCanvasPoint(event);
  selectionRect = normalizeSelection(selectionStart, end);
  selectionStart = null;

  if (!selectionRect || selectionRect.width < 20 || selectionRect.height < 20) {
    clearSelection();
    return;
  }

  useSelectionButton.disabled = false;
  setProgress(0, "Область выделена. Нажмите «Использовать выделение».");
});

canvas.addEventListener("pointercancel", clearSelection);

useSelectionButton.addEventListener("click", () => {
  if (!selectionRect) {
    return;
  }

  applySelection(selectionRect);
  clearSelection();
  resetTable();
  clearGridOverlay();
  clearPerspectivePoints();
  ocrOutput.value = "";
  exportButton.disabled = true;
  rotateLeftButton.disabled = false;
  rotateRightButton.disabled = false;
  thresholdInput.disabled = false;
  deskewInput.disabled = false;
  perspectiveModeButton.disabled = false;
  preprocessButton.disabled = false;
  recognizeButton.disabled = false;
  recognizeTableButton.disabled = true;
  setStatus("Готово");
  setProgress(0, "Выделенная область применена.");
});

resetScanButton.addEventListener("click", () => {
  if (!hasImage) {
    return;
  }

  restoreOriginalCanvas();
  storeSourceCanvas();
  clearSelection();
  clearPerspectivePoints();
  perspectiveMode = false;
  resetTable();
  clearGridOverlay();
  ocrOutput.value = "";
  exportButton.disabled = true;
  rotateLeftButton.disabled = false;
  rotateRightButton.disabled = false;
  thresholdInput.disabled = false;
  deskewInput.disabled = false;
  perspectiveModeButton.disabled = false;
  applyPerspectiveButton.disabled = true;
  preprocessButton.disabled = false;
  recognizeButton.disabled = false;
  recognizeTableButton.disabled = true;
  setStatus("Готово");
  setProgress(0, "Исходный скан восстановлен.");
});

perspectiveModeButton.addEventListener("click", () => {
  if (!hasImage) {
    return;
  }

  perspectiveMode = !perspectiveMode;
  perspectiveModeButton.textContent = perspectiveMode ? "Выйти из перспективы" : "Режим перспективы";
  clearSelection();
  setProgress(0, perspectiveMode ? "Отметьте 4 угла таблицы или листа." : "Режим перспективы выключен.");
});

applyPerspectiveButton.addEventListener("click", () => {
  if (perspectivePoints.length !== 4) {
    return;
  }

  applyPerspectiveCorrection(perspectivePoints);
  clearPerspectivePoints();
  perspectiveMode = false;
  perspectiveModeButton.textContent = "Режим перспективы";
  resetTable();
  clearGridOverlay();
  ocrOutput.value = "";
  exportButton.disabled = true;
  recognizeTableButton.disabled = true;
  storeSourceCanvas();
  setProgress(0, "Перспектива исправлена.");
});

preprocessButton.addEventListener("click", () => {
  if (!hasImage) {
    return;
  }

  setStatus("Поиск сетки");
  setProgress(0, "Подготавливаем скан...");
  resetTable();
  clearGridOverlay();

  try {
    restoreSourceCanvas();
    cropToContent();
    const angle = estimateSkewAngle() + Number(deskewInput.value);
    rotateCanvas(angle);
    storeOcrCanvas();
    thresholdCanvas(Number(thresholdInput.value));
    const detectionSource = hasOcrCanvas() ? ocrCanvas : canvas;
    const detectionContext = detectionSource.getContext("2d", { willReadFrequently: true });
    const imageData = detectionContext.getImageData(0, 0, detectionSource.width, detectionSource.height);
    detectedGrid = detectTableGrid(imageData.data, canvas.width, canvas.height);
    detectedCells = detectedGrid.cells;
    renderGridOverlay(hasMergedCells(detectedGrid.mergedCells) ? detectedGrid.mergedCells : detectedCells);

    recognizeTableButton.disabled = detectedCells.length === 0;
    setStatus("Готово");
    setProgress(100, `${formatGridDetectionMessage(detectedGrid)} Доворот ${angle.toFixed(2)}°.`);
  } catch (error) {
    recognizeTableButton.disabled = true;
    setStatus("Ошибка сетки", true);
    setProgress(0, "Не удалось найти сетку таблицы.");
    console.error(error);
  }
});

recognizeTableButton.addEventListener("click", async () => {
  if (!detectedCells.length || !window.Tesseract) {
    return;
  }

  setButtonsDisabled(true);
  setStatus("Распознавание");
  setProgress(0, "Начинаем OCR таблицы...");

  try {
    if (shouldUseTextTableFallback(detectedGrid)) {
      tableData = await recognizeSelectedTextTable();
      structuredTableCells = [];
      renderTable(tableData);
    } else if (hasMergedCells(detectedGrid?.mergedCells)) {
      structuredTableCells = await recognizeStructuredCells(detectedGrid.mergedCells);
      tableData = buildRowsAndMergesFromCells(structuredTableCells).rows;
      renderStructuredTable(structuredTableCells);
    } else {
      tableData = await recognizeCells(detectedCells);
      structuredTableCells = [];
      renderTable(tableData);
    }

    exportButton.disabled = tableData.length === 0 && structuredTableCells.length === 0;
    setStatus("Готово");
    setProgress(100, "OCR таблицы завершён.");
  } catch (error) {
    setStatus("Ошибка OCR", true);
    setProgress(0, "Не удалось распознать таблицу.");
    console.error(error);
  } finally {
    resetScanButton.disabled = !hasImage;
    rotateLeftButton.disabled = !hasImage;
    rotateRightButton.disabled = !hasImage;
    thresholdInput.disabled = !hasImage;
    deskewInput.disabled = !hasImage;
    perspectiveModeButton.disabled = !hasImage;
    useSelectionButton.disabled = !selectionRect;
    preprocessButton.disabled = !hasImage;
    recognizeButton.disabled = !hasImage;
    recognizeTableButton.disabled = detectedCells.length === 0;
  }
});

recognizeButton.addEventListener("click", async () => {
  if (!hasImage || !window.Tesseract) {
    return;
  }

  setButtonsDisabled(true);
  setStatus("Распознавание");
  setProgress(0, "Начинаем OCR текста...");
  resetTable();
  clearGridOverlay();

  try {
    const result = await Tesseract.recognize(getOcrInputCanvas(), languageSelect.value, {
      ...getTesseractOptions(),
      logger: updateOcrProgress,
    });

    ocrOutput.value = normalizeOcrText(result.data.text);
    exportButton.disabled = ocrOutput.value.trim().length === 0;
    setStatus("Готово");
    setProgress(100, "OCR завершён.");
  } catch (error) {
    setStatus("Ошибка OCR", true);
    setProgress(0, "Не удалось распознать текст.");
    console.error(error);
  } finally {
    resetScanButton.disabled = !hasImage;
    rotateLeftButton.disabled = !hasImage;
    rotateRightButton.disabled = !hasImage;
    thresholdInput.disabled = !hasImage;
    deskewInput.disabled = !hasImage;
    perspectiveModeButton.disabled = !hasImage;
    useSelectionButton.disabled = !selectionRect;
    preprocessButton.disabled = !hasImage;
    recognizeButton.disabled = !hasImage;
    recognizeTableButton.disabled = detectedCells.length === 0;
  }
});

exportButton.addEventListener("click", () => {
  if (!window.XLSX) {
    return;
  }

  const cells = structuredTableCells.length ? readStructuredTableCells() : [];
  const rows = tableData.length || cells.length ? readTableData() : readTextData();
  if (!rows.length) {
    return;
  }

  const mode = tableData.length || cells.length ? "OCR таблицы" : "OCR текста";
  const metadataRows = buildMetadataRows({
    sourceFile: currentFileName,
    mode,
    language: languageSelect.value,
    pdfPage: pdfDocument ? pdfPageSelect.value : "",
    exportedAt: new Date().toISOString(),
    rowCount: rows.length,
    columnCount: Math.max(0, ...rows.map((row) => row.length)),
  });
  const workbook = buildWorkbook(XLSX, {
    rows,
    cells: cells.length ? cells : undefined,
    sheetName: createSafeSheetName(mode),
    metadataRows,
  });

  XLSX.writeFile(workbook, createExportFileName(currentFileName));
});

ocrOutput.addEventListener("input", () => {
  if (!tableData.length) {
    exportButton.disabled = ocrOutput.value.trim().length === 0;
  }
});

insertRowButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  tableData = insertRowAfter(readTableData(), position.row);
  structuredTableCells = [];
  renderTable(tableData, position.row + 1, position.col);
});

deleteRowButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  tableData = deleteRowAt(readTableData(), position.row);
  structuredTableCells = [];
  renderTable(tableData, Math.min(position.row, tableData.length - 1), position.col);
});

insertColumnButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  tableData = insertColumnAfter(readTableData(), position.col);
  structuredTableCells = [];
  renderTable(tableData, position.row, position.col + 1);
});

deleteColumnButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  tableData = deleteColumnAt(readTableData(), position.col);
  structuredTableCells = [];
  renderTable(tableData, position.row, Math.min(position.col, tableData[0].length - 1));
});

mergeRightButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  const cells = readStructuredTableCellsFromCurrentTable();
  const merged = mergeCellRight(cells, position.row, position.col);
  if (!merged.changed) {
    return;
  }

  structuredTableCells = merged.cells;
  tableData = buildRowsAndMergesFromCells(structuredTableCells).rows;
  renderStructuredTable(structuredTableCells, position.row, position.col);
  syncTextOutputFromTable();
});

mergeDownButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  const cells = readStructuredTableCellsFromCurrentTable();
  const merged = mergeCellDown(cells, position.row, position.col);
  if (!merged.changed) {
    return;
  }

  structuredTableCells = merged.cells;
  tableData = buildRowsAndMergesFromCells(structuredTableCells).rows;
  renderStructuredTable(structuredTableCells, position.row, position.col);
  syncTextOutputFromTable();
});

splitCellButton.addEventListener("click", () => {
  const position = getActiveCellPosition();
  if (!position) {
    return;
  }

  const cells = readStructuredTableCellsFromCurrentTable();
  const split = splitStructuredCell(cells, position.row, position.col);
  if (!split.changed) {
    return;
  }

  structuredTableCells = split.cells;
  tableData = buildRowsAndMergesFromCells(structuredTableCells).rows;
  if (hasMergedCells(structuredTableCells)) {
    renderStructuredTable(structuredTableCells, position.row, position.col);
  } else {
    structuredTableCells = [];
    renderTable(tableData, position.row, position.col);
  }
  syncTextOutputFromTable();
});

window.addEventListener("resize", () => {
  if (detectedCells.length) {
    renderGridOverlay(hasMergedCells(detectedGrid?.mergedCells) ? detectedGrid.mergedCells : detectedCells);
  }
  if (perspectivePoints.length) {
    renderCornerOverlay();
  }
});

function drawImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const maxSide = 2200;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));

      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      showCanvas();
      URL.revokeObjectURL(url);
      resolve();
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be loaded."));
    };

    image.src = url;
  });
}

async function loadPdfFile(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js is not available.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

  const bytes = await file.arrayBuffer();
  pdfDocument = await pdfjsLib.getDocument({ data: bytes }).promise;
  populatePdfPageSelect(pdfDocument.pageCount || pdfDocument.numPages);
  await renderPdfPage(1);
}

async function renderPdfPage(pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const maxSide = 2200;
  const scale = Math.min(2, maxSide / Math.max(viewport.width, viewport.height));
  const scaledViewport = page.getViewport({ scale });

  canvas.width = Math.round(scaledViewport.width);
  canvas.height = Math.round(scaledViewport.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  setProgress(0, `Отрисовываем страницу ${pageNumber} из ${pdfDocument.numPages}...`);

  await page.render({
    canvasContext: ctx,
    viewport: scaledViewport,
  }).promise;

  showCanvas();
}

function populatePdfPageSelect(pageCount) {
  pdfPageSelect.replaceChildren();

  for (let page = 1; page <= pageCount; page++) {
    const option = document.createElement("option");
    option.value = String(page);
    option.textContent = `Страница ${page}`;
    pdfPageSelect.append(option);
  }

  pdfPageSelect.value = "1";
  pdfPageField.hidden = false;
}

function cropToContent() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const threshold = 210;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      const gray = toGray(data[i], data[i + 1], data[i + 2]);
      if (gray < threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return;
  }

  const margin = 24;
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(canvas.width, maxX + margin);
  maxY = Math.min(canvas.height, maxY + margin);

  const width = maxX - minX;
  const height = maxY - minY;
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  cropped.getContext("2d").drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(cropped, 0, 0);
}

function estimateSkewAngle() {
  const sample = document.createElement("canvas");
  const maxSide = 600;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  sample.width = Math.max(1, Math.round(canvas.width * scale));
  sample.height = Math.max(1, Math.round(canvas.height * scale));
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(canvas, 0, 0, sample.width, sample.height);

  const imageData = sampleCtx.getImageData(0, 0, sample.width, sample.height);
  const darkPoints = [];

  for (let y = 0; y < sample.height; y += 3) {
    for (let x = 0; x < sample.width; x += 3) {
      const i = (y * sample.width + x) * 4;
      const gray = toGray(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
      if (gray < 150) {
        darkPoints.push([x, y]);
      }
    }
  }

  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let angle = -4; angle <= 4; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const bins = new Map();

    for (const [x, y] of darkPoints) {
      const projectedY = Math.round(x * sin + y * cos);
      bins.set(projectedY, (bins.get(projectedY) || 0) + 1);
    }

    let score = 0;
    for (const count of bins.values()) {
      score += count * count;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

function rotateCanvas(angle) {
  if (Math.abs(angle) < 0.25) {
    return;
  }

  const radians = (-angle * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const nextWidth = Math.ceil(canvas.width * cos + canvas.height * sin);
  const nextHeight = Math.ceil(canvas.width * sin + canvas.height * cos);
  const rotated = document.createElement("canvas");

  rotated.width = nextWidth;
  rotated.height = nextHeight;
  const rotatedCtx = rotated.getContext("2d");
  rotatedCtx.fillStyle = "#ffffff";
  rotatedCtx.fillRect(0, 0, nextWidth, nextHeight);
  rotatedCtx.translate(nextWidth / 2, nextHeight / 2);
  rotatedCtx.rotate(radians);
  rotatedCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  ctx.drawImage(rotated, 0, 0);
}

function thresholdCanvas(threshold) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = toGray(data[i], data[i + 1], data[i + 2]);
    const value = gray < threshold ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
}

async function recognizeCells(cells) {
  const rows = Math.max(...cells.map((cell) => cell.row)) + 1;
  const cols = Math.max(...cells.map((cell) => cell.col)) + 1;
  const data = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  const worker = await createOcrWorker((message, cellIndex) => {
    if (message.status === "recognizing text") {
      const base = (cellIndex / cells.length) * 100;
      const current = message.progress * (100 / cells.length);
      setProgress(Math.round(base + current), `Ячейка ${cellIndex + 1} из ${cells.length}`);
    }
  });

  try {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const crop = cropCell(cell);
      const result = await worker.recognize(crop, i);

      data[cell.row][cell.col] = normalizeCellText(result.data.text);
    }
  } finally {
    await worker.terminate();
  }

  return data;
}

async function recognizeStructuredCells(cells) {
  const output = cells.map((cell) => ({ ...cell, text: "" }));
  const worker = await createOcrWorker((message, cellIndex) => {
    if (message.status === "recognizing text") {
      const base = (cellIndex / cells.length) * 100;
      const current = message.progress * (100 / cells.length);
      setProgress(Math.round(base + current), `Ячейка ${cellIndex + 1} из ${cells.length}`);
    }
  });

  try {
    for (let i = 0; i < output.length; i++) {
      const crop = cropCell(output[i]);
      const result = await worker.recognize(crop, i);
      output[i].text = normalizeCellText(result.data.text);
    }
  } finally {
    await worker.terminate();
  }

  return output;
}

function hasMergedCells(cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return false;
  }

  const mergedCount = cells.filter((cell) => cell.rowSpan > 1 || cell.colSpan > 1).length;
  if (!mergedCount) {
    return false;
  }

  return mergedCount / cells.length <= 0.25;
}

function shouldUseTextTableFallback(grid) {
  return !grid || grid.rows < 6 || grid.cols > 8;
}

async function recognizeSelectedTextTable() {
  setProgress(0, "Сетка выглядит ненадёжно. Читаем выбранную область как текстовую таблицу...");
  const lineRemovedSource = createLineRemovedOcrCanvas(getOcrInputCanvas());
  const baseResult = await recognizeFallbackSource(lineRemovedSource, "Читаем таблицу после очистки линий...");
  const scaledResult = await recognizeFallbackSource(createScaledOcrCanvas(lineRemovedSource), "Читаем увеличенную таблицу...");

  const best = chooseBestTable([
    ...createFallbackCandidates(baseResult, "base"),
    ...createFallbackCandidates(scaledResult, "scaled"),
  ]);

  setProgress(100, `Запасной OCR завершён (${best.strategy}, оценка ${best.score}).`);
  return normalizeTableRows(best.rows.length ? best.rows : [[""]]);
}

async function recognizeFallbackSource(source, message) {
  setProgress(0, message);
  return Tesseract.recognize(source, languageSelect.value, {
    ...getTesseractOptions({ tessedit_pageseg_mode: "4" }),
    logger: updateOcrProgress,
  });
}

function createFallbackCandidates(result, label) {
  return [
    { strategy: `${label}-words`, rows: buildTableFromWords(result.data.words) },
    { strategy: `${label}-preset`, rows: parseVedomostTextTable(result.data.text), scoreBonus: 0.18 },
    { strategy: `${label}-text`, rows: parseOcrTextTable(result.data.text) },
  ];
}

async function createOcrWorker(onProgress) {
  if (!window.Tesseract?.createWorker) {
    return {
      recognize(crop, cellIndex) {
        return Tesseract.recognize(crop, languageSelect.value, {
          ...getTesseractOptions(),
          logger(message) {
            onProgress(message, cellIndex);
          },
        });
      },
      terminate() {
        return Promise.resolve();
      },
    };
  }

  let currentCellIndex = 0;
  const worker = await Tesseract.createWorker(languageSelect.value, 1, {
    logger(message) {
      onProgress(message, currentCellIndex);
    },
  });

  await worker.setParameters(getTesseractOptions({ tessedit_pageseg_mode: "7" }));

  return {
    recognize(crop, cellIndex) {
      currentCellIndex = cellIndex;
      return worker.recognize(crop);
    },
    terminate() {
      return worker.terminate();
    },
  };
}

function cropCell(cell) {
  const source = hasOcrCanvas() ? ocrCanvas : canvas;
  const paddingX = cell.width < 80 ? 1 : Math.min(4, Math.max(2, Math.round(cell.width * 0.03)));
  const paddingY = cell.height < 32 ? 1 : Math.min(4, Math.max(2, Math.round(cell.height * 0.05)));
  const sourceX = Math.min(source.width, cell.x + paddingX);
  const sourceY = Math.min(source.height, cell.y + paddingY);
  const sourceWidth = Math.max(1, Math.min(source.width - sourceX, cell.width - paddingX * 2));
  const sourceHeight = Math.max(1, Math.min(source.height - sourceY, cell.height - paddingY * 2));
  const scale = Math.max(3, Math.min(8, Math.ceil(180 / Math.max(1, sourceHeight))));
  const crop = document.createElement("canvas");

  crop.width = Math.max(1, Math.round(sourceWidth * scale));
  crop.height = Math.max(1, Math.round(sourceHeight * scale));
  const cropCtx = crop.getContext("2d", { willReadFrequently: true });
  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, crop.width, crop.height);
  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = "high";
  cropCtx.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
  enhanceOcrCrop(crop, cropCtx);

  return crop;
}

function enhanceOcrCrop(crop, cropCtx) {
  const imageData = cropCtx.getImageData(0, 0, crop.width, crop.height);
  const data = imageData.data;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const gray = toGray(data[i], data[i + 1], data[i + 2]);
    min = Math.min(min, gray);
    max = Math.max(max, gray);
  }

  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const gray = toGray(data[i], data[i + 1], data[i + 2]);
    const normalized = Math.round(((gray - min) / range) * 255);
    const contrasted = normalized < 245 ? Math.max(0, normalized - 18) : 255;
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }

  cropCtx.putImageData(imageData, 0, 0);
}

function createLineRemovedOcrCanvas(source) {
  const clean = document.createElement("canvas");
  clean.width = source.width;
  clean.height = source.height;
  const cleanCtx = clean.getContext("2d", { willReadFrequently: true });
  cleanCtx.fillStyle = "#ffffff";
  cleanCtx.fillRect(0, 0, clean.width, clean.height);
  cleanCtx.drawImage(source, 0, 0);

  const imageData = cleanCtx.getImageData(0, 0, clean.width, clean.height);
  const horizontalLines = findDarkLineCenters(imageData.data, clean.width, clean.height, "horizontal");
  const verticalLines = findDarkLineCenters(imageData.data, clean.width, clean.height, "vertical");

  cleanCtx.fillStyle = "#ffffff";
  for (const y of horizontalLines) {
    cleanCtx.fillRect(0, Math.max(0, y - 2), clean.width, 5);
  }

  for (const x of verticalLines) {
    cleanCtx.fillRect(Math.max(0, x - 2), 0, 5, clean.height);
  }

  return clean;
}

function createScaledOcrCanvas(source) {
  const targetHeight = 1200;
  const scale = Math.min(4, Math.max(1, targetHeight / Math.max(1, source.height)));
  if (scale <= 1.05) {
    return source;
  }

  const scaled = document.createElement("canvas");
  scaled.width = Math.max(1, Math.round(source.width * scale));
  scaled.height = Math.max(1, Math.round(source.height * scale));
  const scaledCtx = scaled.getContext("2d", { willReadFrequently: true });

  scaledCtx.fillStyle = "#ffffff";
  scaledCtx.fillRect(0, 0, scaled.width, scaled.height);
  scaledCtx.imageSmoothingEnabled = true;
  scaledCtx.imageSmoothingQuality = "high";
  scaledCtx.drawImage(source, 0, 0, scaled.width, scaled.height);

  return scaled;
}

function findDarkLineCenters(data, width, height, direction) {
  const indices = [];
  const isHorizontal = direction === "horizontal";
  const outerLimit = isHorizontal ? height : width;
  const innerLimit = isHorizontal ? width : height;
  const minDarkPixels = Math.max(24, innerLimit * (isHorizontal ? 0.24 : 0.18));

  for (let outer = 0; outer < outerLimit; outer++) {
    let darkPixels = 0;
    for (let inner = 0; inner < innerLimit; inner++) {
      const x = isHorizontal ? inner : outer;
      const y = isHorizontal ? outer : inner;
      const index = (y * width + x) * 4;
      const gray = toGray(data[index], data[index + 1], data[index + 2]);
      if (gray < 165) {
        darkPixels++;
      }
    }

    if (darkPixels >= minDarkPixels) {
      indices.push(outer);
    }
  }

  return groupLineCenters(indices, 4);
}

function groupLineCenters(indices, maxGap) {
  if (!indices.length) {
    return [];
  }

  const centers = [];
  let start = indices[0];
  let end = indices[0];

  for (const value of indices.slice(1)) {
    if (value - end <= maxGap) {
      end = value;
      continue;
    }

    centers.push(Math.round((start + end) / 2));
    start = value;
    end = value;
  }

  centers.push(Math.round((start + end) / 2));
  return centers;
}

function renderTable(rows, focusRow = 0, focusCol = 0) {
  tableWrap.replaceChildren();
  activeCell = null;

  const table = document.createElement("table");
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const tr = document.createElement("tr");
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const value = row[colIndex];
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);
      td.textContent = value;
      td.addEventListener("focus", () => setActiveCell(td));
      td.addEventListener("click", () => setActiveCell(td));
      td.addEventListener("input", syncTextOutputFromTable);
      tr.append(td);
    }
    table.append(tr);
  }

  tableWrap.append(table);
  tableWrap.hidden = false;
  editorToolbar.hidden = false;
  ocrOutput.value = rows.map((row) => row.join("\t")).join("\n");
  setEditorButtonsDisabled(true);

  const focusTarget = table.querySelector(`td[data-row="${focusRow}"][data-col="${focusCol}"]`);
  if (focusTarget) {
    focusTarget.focus();
  }
}

function renderStructuredTable(cells, focusRow = 0, focusCol = 0) {
  tableWrap.replaceChildren();
  activeCell = null;

  const table = document.createElement("table");
  const rowCount = cells.reduce((max, cell) => Math.max(max, cell.row + cell.rowSpan), 0);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const tr = document.createElement("tr");
    for (const cell of cells.filter((candidate) => candidate.row === rowIndex).sort((a, b) => a.col - b.col)) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.row = String(cell.row);
      td.dataset.col = String(cell.col);
      td.dataset.rowSpan = String(cell.rowSpan);
      td.dataset.colSpan = String(cell.colSpan);
      if (cell.rowSpan > 1) {
        td.rowSpan = cell.rowSpan;
      }
      if (cell.colSpan > 1) {
        td.colSpan = cell.colSpan;
      }
      td.textContent = cell.text;
      td.addEventListener("focus", () => setActiveCell(td));
      td.addEventListener("click", () => setActiveCell(td));
      td.addEventListener("input", syncTextOutputFromTable);
      tr.append(td);
    }
    table.append(tr);
  }

  tableWrap.append(table);
  tableWrap.hidden = false;
  editorToolbar.hidden = false;
  ocrOutput.value = buildRowsAndMergesFromCells(cells).rows.map((row) => row.join("\t")).join("\n");
  setEditorButtonsDisabled(true);

  const focusTarget = table.querySelector(`td[data-row="${focusRow}"][data-col="${focusCol}"]`);
  if (focusTarget) {
    focusTarget.focus();
  }
}

function readTableData() {
  if (structuredTableCells.length) {
    return buildRowsAndMergesFromCells(readStructuredTableCells()).rows;
  }

  return [...tableWrap.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim()),
  );
}

function readStructuredTableCells() {
  return [...tableWrap.querySelectorAll("td")].map((cell) => ({
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
    rowSpan: Number(cell.dataset.rowSpan || cell.rowSpan || 1),
    colSpan: Number(cell.dataset.colSpan || cell.colSpan || 1),
    text: cell.textContent.trim(),
  }));
}

function readStructuredTableCellsFromCurrentTable() {
  if (structuredTableCells.length) {
    return readStructuredTableCells();
  }

  return readTableData().flatMap((row, rowIndex) =>
    row.map((text, colIndex) => ({
      row: rowIndex,
      col: colIndex,
      rowSpan: 1,
      colSpan: 1,
      text,
    })),
  );
}

function mergeCellRight(cells, row, col) {
  const source = cells.find((cell) => cell.row === row && cell.col === col);
  if (!source) {
    return { changed: false, cells };
  }

  const targetCol = source.col + source.colSpan;
  const target = cells.find((cell) => cell.row === row && cell.col === targetCol && cell.rowSpan === source.rowSpan);
  if (!target) {
    return { changed: false, cells };
  }

  const mergedText = [source.text, target.text].filter(Boolean).join(" ").trim();
  const nextCells = cells
    .filter((cell) => cell !== target)
    .map((cell) =>
      cell === source
        ? {
            ...cell,
            colSpan: source.colSpan + target.colSpan,
            text: mergedText,
          }
        : cell,
    );

  return { changed: true, cells: sortStructuredCells(nextCells) };
}

function mergeCellDown(cells, row, col) {
  const source = cells.find((cell) => cell.row === row && cell.col === col);
  if (!source) {
    return { changed: false, cells };
  }

  const targetRow = source.row + source.rowSpan;
  const target = cells.find((cell) => cell.row === targetRow && cell.col === col && cell.colSpan === source.colSpan);
  if (!target) {
    return { changed: false, cells };
  }

  const mergedText = [source.text, target.text].filter(Boolean).join(" ").trim();
  const nextCells = cells
    .filter((cell) => cell !== target)
    .map((cell) =>
      cell === source
        ? {
            ...cell,
            rowSpan: source.rowSpan + target.rowSpan,
            text: mergedText,
          }
        : cell,
    );

  return { changed: true, cells: sortStructuredCells(nextCells) };
}

function splitStructuredCell(cells, row, col) {
  const source = cells.find((cell) => cell.row === row && cell.col === col);
  if (!source || (source.rowSpan === 1 && source.colSpan === 1)) {
    return { changed: false, cells };
  }

  const nextCells = cells.filter((cell) => cell !== source);
  for (let rowOffset = 0; rowOffset < source.rowSpan; rowOffset++) {
    for (let colOffset = 0; colOffset < source.colSpan; colOffset++) {
      nextCells.push({
        row: source.row + rowOffset,
        col: source.col + colOffset,
        rowSpan: 1,
        colSpan: 1,
        text: rowOffset === 0 && colOffset === 0 ? source.text : "",
      });
    }
  }

  return { changed: true, cells: sortStructuredCells(nextCells) };
}

function sortStructuredCells(cells) {
  return [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
}

function readTextData() {
  return ocrOutput.value.trim().split(/\r?\n/).filter(Boolean).map((line) => [line]);
}

function resetResults() {
  resetTable();
  clearSelection();
  clearGridOverlay();
  clearPerspectivePoints();
  perspectiveMode = false;
  perspectiveModeButton.textContent = "Режим перспективы";
  clearOcrCanvas();
  detectedCells = [];
  detectedGrid = null;
  ocrOutput.value = "";
  exportButton.disabled = true;
  useSelectionButton.disabled = true;
  resetScanButton.disabled = true;
  rotateLeftButton.disabled = true;
  rotateRightButton.disabled = true;
  thresholdInput.disabled = true;
  deskewInput.disabled = true;
  perspectiveModeButton.disabled = true;
  applyPerspectiveButton.disabled = true;
  preprocessButton.disabled = true;
  recognizeTableButton.disabled = true;
  recognizeButton.disabled = true;
}

function resetPdfPageSelect() {
  pdfPageSelect.replaceChildren();
  pdfPageField.hidden = true;
}

function resetTable() {
  tableData = [];
  structuredTableCells = [];
  detectedCells = [];
  detectedGrid = null;
  activeCell = null;
  editorToolbar.hidden = true;
  setEditorButtonsDisabled(true);
  tableWrap.hidden = true;
  tableWrap.replaceChildren();
}

function setActiveCell(cell) {
  if (activeCell) {
    activeCell.classList.remove("active-cell");
  }

  activeCell = cell;
  activeCell.classList.add("active-cell");
  setEditorButtonsDisabled(false);
}

function getActiveCellPosition() {
  if (!activeCell) {
    return null;
  }

  return {
    row: Number(activeCell.dataset.row),
    col: Number(activeCell.dataset.col),
  };
}

function setEditorButtonsDisabled(disabled) {
  insertRowButton.disabled = disabled;
  deleteRowButton.disabled = disabled;
  insertColumnButton.disabled = disabled;
  deleteColumnButton.disabled = disabled;
  mergeRightButton.disabled = disabled;
  mergeDownButton.disabled = disabled;
  splitCellButton.disabled = disabled;
}

function syncTextOutputFromTable() {
  const rows = readTableData();
  ocrOutput.value = rows.map((row) => row.join("\t")).join("\n");
}

function renderGridOverlay(cells) {
  clearGridOverlay();

  if (!cells.length) {
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;

  gridOverlay.style.left = `${canvasRect.left - wrapRect.left}px`;
  gridOverlay.style.top = `${canvasRect.top - wrapRect.top}px`;
  gridOverlay.style.width = `${canvasRect.width}px`;
  gridOverlay.style.height = `${canvasRect.height}px`;
  gridOverlay.hidden = false;

  for (const cell of cells) {
    const element = document.createElement("div");
    element.className = "grid-cell";
    element.style.left = `${cell.x * scaleX}px`;
    element.style.top = `${cell.y * scaleY}px`;
    element.style.width = `${cell.width * scaleX}px`;
    element.style.height = `${cell.height * scaleY}px`;
    gridOverlay.append(element);
  }
}

function clearGridOverlay() {
  gridOverlay.hidden = true;
  gridOverlay.replaceChildren();
  gridOverlay.removeAttribute("style");
}

function addPerspectivePoint(point) {
  if (perspectivePoints.length >= 4) {
    perspectivePoints = [];
  }

  perspectivePoints.push({ x: point.imageX, y: point.imageY });
  renderCornerOverlay();
  applyPerspectiveButton.disabled = perspectivePoints.length !== 4;
  setProgress(0, `Выбрано углов перспективы: ${perspectivePoints.length}/4.`);
}

function clearPerspectivePoints() {
  perspectivePoints = [];
  applyPerspectiveButton.disabled = true;
  cornerOverlay.hidden = true;
  cornerOverlay.replaceChildren();
  cornerOverlay.removeAttribute("style");
}

function renderCornerOverlay() {
  cornerOverlay.replaceChildren();

  if (!perspectivePoints.length) {
    cornerOverlay.hidden = true;
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const scaleX = canvasRect.width / canvas.width;
  const scaleY = canvasRect.height / canvas.height;

  cornerOverlay.style.left = `${canvasRect.left - wrapRect.left}px`;
  cornerOverlay.style.top = `${canvasRect.top - wrapRect.top}px`;
  cornerOverlay.style.width = `${canvasRect.width}px`;
  cornerOverlay.style.height = `${canvasRect.height}px`;
  cornerOverlay.hidden = false;

  const orderedPoints = perspectivePoints.length === 4 ? orderQuadPoints(perspectivePoints) : perspectivePoints;
  for (let i = 0; i < orderedPoints.length; i++) {
    const point = orderedPoints[i];
    addCornerPoint(point, scaleX, scaleY);

    if (orderedPoints.length > 1) {
      const next = orderedPoints[(i + 1) % orderedPoints.length];
      if (i < orderedPoints.length - 1 || orderedPoints.length === 4) {
        addCornerLine(point, next, scaleX, scaleY);
      }
    }
  }
}

function addCornerPoint(point, scaleX, scaleY) {
  const element = document.createElement("div");
  element.className = "corner-point";
  element.style.left = `${point.x * scaleX}px`;
  element.style.top = `${point.y * scaleY}px`;
  cornerOverlay.append(element);
}

function addCornerLine(start, end, scaleX, scaleY) {
  const x1 = start.x * scaleX;
  const y1 = start.y * scaleY;
  const x2 = end.x * scaleX;
  const y2 = end.y * scaleY;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const element = document.createElement("div");

  element.className = "corner-line";
  element.style.left = `${x1}px`;
  element.style.top = `${y1}px`;
  element.style.width = `${length}px`;
  element.style.transform = `rotate(${angle}rad)`;
  cornerOverlay.append(element);
}

function applyPerspectiveCorrection(points) {
  const { width, height } = getQuadOutputSize(points);
  const transform = createPerspectiveTransform(points, width, height);
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const corrected = document.createElement("canvas");
  corrected.width = width;
  corrected.height = height;
  const correctedCtx = corrected.getContext("2d", { willReadFrequently: true });
  const output = correctedCtx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourcePoint = transform(x, y);
      copySampledPixel(source, output, canvas.width, canvas.height, width, x, y, sourcePoint);
    }
  }

  correctedCtx.putImageData(output, 0, 0);
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(corrected, 0, 0);
}

function copySampledPixel(source, output, sourceWidth, sourceHeight, outputWidth, targetX, targetY, sourcePoint) {
  const x = Math.min(sourceWidth - 1, Math.max(0, Math.round(sourcePoint.x)));
  const y = Math.min(sourceHeight - 1, Math.max(0, Math.round(sourcePoint.y)));
  const sourceIndex = (y * sourceWidth + x) * 4;
  const targetIndex = (targetY * outputWidth + targetX) * 4;

  output.data[targetIndex] = source.data[sourceIndex];
  output.data[targetIndex + 1] = source.data[sourceIndex + 1];
  output.data[targetIndex + 2] = source.data[sourceIndex + 2];
  output.data[targetIndex + 3] = source.data[sourceIndex + 3];
}

function setButtonsDisabled(disabled) {
  useSelectionButton.disabled = disabled || !selectionRect;
  resetScanButton.disabled = disabled || !hasImage;
  rotateLeftButton.disabled = disabled || !hasImage;
  rotateRightButton.disabled = disabled || !hasImage;
  thresholdInput.disabled = disabled || !hasImage;
  deskewInput.disabled = disabled || !hasImage;
  perspectiveModeButton.disabled = disabled || !hasImage;
  applyPerspectiveButton.disabled = disabled || perspectivePoints.length !== 4;
  preprocessButton.disabled = disabled;
  recognizeTableButton.disabled = disabled;
  recognizeButton.disabled = disabled;
  exportButton.disabled = disabled;
}

function storeOriginalCanvas() {
  originalCanvas.width = canvas.width;
  originalCanvas.height = canvas.height;
  originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  originalCtx.drawImage(canvas, 0, 0);
}

function storeSourceCanvas() {
  sourceCanvas.width = canvas.width;
  sourceCanvas.height = canvas.height;
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(canvas, 0, 0);
  clearOcrCanvas();
}

function storeOcrCanvas() {
  ocrCanvas.width = canvas.width;
  ocrCanvas.height = canvas.height;
  ocrCtx.clearRect(0, 0, ocrCanvas.width, ocrCanvas.height);
  ocrCtx.drawImage(canvas, 0, 0);
}

function clearOcrCanvas() {
  ocrCanvas.width = 0;
  ocrCanvas.height = 0;
}

function hasOcrCanvas() {
  return ocrCanvas.width === canvas.width && ocrCanvas.height === canvas.height;
}

function getOcrInputCanvas() {
  return hasOcrCanvas() ? ocrCanvas : canvas;
}

function restoreSourceCanvas() {
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
}

function restoreOriginalCanvas() {
  canvas.width = originalCanvas.width;
  canvas.height = originalCanvas.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalCanvas, 0, 0);
  clearOcrCanvas();
}

function rotateWorkingImage(degrees) {
  if (!hasImage) {
    return;
  }

  const rotated = document.createElement("canvas");
  const turnRight = degrees > 0;
  rotated.width = canvas.height;
  rotated.height = canvas.width;
  const rotatedCtx = rotated.getContext("2d");
  rotatedCtx.fillStyle = "#ffffff";
  rotatedCtx.fillRect(0, 0, rotated.width, rotated.height);

  if (turnRight) {
    rotatedCtx.translate(rotated.width, 0);
    rotatedCtx.rotate(Math.PI / 2);
  } else {
    rotatedCtx.translate(0, rotated.height);
    rotatedCtx.rotate(-Math.PI / 2);
  }

  rotatedCtx.drawImage(canvas, 0, 0);
  canvas.width = rotated.width;
  canvas.height = rotated.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rotated, 0, 0);
  storeSourceCanvas();
  clearPerspectivePoints();
  perspectiveMode = false;
  perspectiveModeButton.textContent = "Режим перспективы";
  clearSelection();
  resetTable();
  clearGridOverlay();
  ocrOutput.value = "";
  exportButton.disabled = true;
  recognizeTableButton.disabled = true;
  setProgress(0, turnRight ? "Повернули вправо." : "Повернули влево.");
}

function applySelection(rect) {
  const cropped = document.createElement("canvas");
  cropped.width = rect.width;
  cropped.height = rect.height;
  cropped.getContext("2d").drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cropped, 0, 0);
  storeSourceCanvas();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

  return {
    displayX: x,
    displayY: y,
    imageX: Math.round((x / rect.width) * canvas.width),
    imageY: Math.round((y / rect.height) * canvas.height),
  };
}

function normalizeSelection(start, end) {
  const x1 = Math.min(start.imageX, end.imageX);
  const y1 = Math.min(start.imageY, end.imageY);
  const x2 = Math.max(start.imageX, end.imageX);
  const y2 = Math.max(start.imageY, end.imageY);

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function updateSelectionBox(start, end) {
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const left = canvasRect.left - wrapRect.left + Math.min(start.displayX, end.displayX);
  const top = canvasRect.top - wrapRect.top + Math.min(start.displayY, end.displayY);
  const width = Math.abs(end.displayX - start.displayX);
  const height = Math.abs(end.displayY - start.displayY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function clearSelection() {
  selectionStart = null;
  selectionRect = null;
  selectionBox.hidden = true;
  selectionBox.removeAttribute("style");
  useSelectionButton.disabled = true;
}

function showCanvas() {
  canvas.style.display = "block";
  emptyCanvas.style.display = "none";
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function toGray(red, green, blue) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function updateOcrProgress(message) {
  if (message.status === "recognizing text") {
    const percent = Math.round(message.progress * 100);
    setProgress(percent, `Распознаём текст: ${percent}%`);
    return;
  }

  if (message.status) {
    setProgress(null, message.status);
  }
}

function setProgress(percent, text) {
  if (typeof percent === "number") {
    progressBar.style.width = `${percent}%`;
  }

  progressText.textContent = text;
}

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", isError);
}
