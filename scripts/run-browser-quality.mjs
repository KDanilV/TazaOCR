import { createServer } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const root = process.cwd();
const exampleDir = resolve(root, "example");
const actualDir = resolve(exampleDir, "actual");
const chromePath = findChromePath();
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".pdf"]);
const defaultTimeout = 180_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(exampleDir)) {
    throw new Error("example/ not found");
  }

  if (!chromePath) {
    throw new Error("Chrome or Edge executable was not found");
  }

  await mkdir(actualDir, { recursive: true });

  if (options.clean) {
    await rm(actualDir, { recursive: true, force: true });
    await mkdir(actualDir, { recursive: true });
  }

  const files = options.files.length ? options.files.map((file) => resolve(root, file)) : await listExampleFiles();
  if (!files.length) {
    throw new Error("No supported example files found");
  }

  const server = createStaticServer(root);
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: options.headed ? false : true,
  });

  try {
    const port = server.address().port;
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(defaultTimeout);
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        console.log(`browser ${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      console.log(`browser pageerror: ${error.message}`);
    });

    for (const filePath of files) {
      await runSingleFile(page, port, filePath, options);
    }
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function runSingleFile(page, port, filePath, options) {
  const sheetName = createOutputName(filePath);
  const outputPath = join(actualDir, `${sheetName}.xlsx`);

  console.log(`processing ${filePath}`);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#imageInput").setInputFiles(filePath);
  await page.locator("#recognizeButton").waitFor({ state: "attached" });
  await page.waitForFunction(() => !document.querySelector("#preprocessButton").disabled, null, { timeout: defaultTimeout });

  if (extname(filePath).toLowerCase() === ".pdf" && options.pdfPage !== 1) {
    await page.locator("#pdfPageSelect").selectOption(String(options.pdfPage));
    await page.waitForFunction(() => !document.querySelector("#preprocessButton").disabled, null, { timeout: defaultTimeout });
  }

  if (options.language) {
    await page.locator("#languageSelect").selectOption(options.language);
  }

  if (options.deskew !== null) {
    await page.locator("#deskewInput").fill(String(options.deskew));
    await page.locator("#deskewInput").dispatchEvent("input");
  }

  if (options.perspective) {
    await applyPerspectiveCorrection(page, options.perspective);
  }

  if (options.selectVedomost) {
    await selectVedomostRegion(page, options.region);
  }

  await page.locator("#preprocessButton").click();
  await page.waitForFunction(
    () => document.querySelector("#progressText").textContent.includes("Detected")
      || document.querySelector("#progressText").textContent.includes("No clear table grid found"),
    null,
    { timeout: defaultTimeout },
  );

  const canRecognizeTable = await page.locator("#recognizeTableButton").evaluate((button) => !button.disabled);
  if (!canRecognizeTable) {
    console.log(`skipping ${filePath}: table grid was not detected`);
    return;
  }

  await page.locator("#recognizeTableButton").click();
  try {
    await page.waitForFunction(() => !document.querySelector("#exportButton").disabled, null, { timeout: defaultTimeout });
  } catch (error) {
    await printBrowserState(page, filePath);
    throw error;
  }

  const downloadPromise = page.waitForEvent("download", { timeout: defaultTimeout });
  await page.locator("#exportButton").click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);

  console.log(`saved ${outputPath}`);
}

async function printBrowserState(page, filePath) {
  const state = await page.evaluate(() => ({
    fileName: document.querySelector("#fileName")?.textContent,
    progressText: document.querySelector("#progressText")?.textContent,
    status: document.querySelector("#status")?.textContent,
    exportDisabled: document.querySelector("#exportButton")?.disabled,
    recognizeTableDisabled: document.querySelector("#recognizeTableButton")?.disabled,
    gridCells: document.querySelectorAll("#gridOverlay .grid-cell").length,
    tableRows: document.querySelectorAll("#tableWrap tr").length,
  }));

  console.log(`state after timeout for ${filePath}: ${JSON.stringify(state)}`);
}

async function selectVedomostRegion(page, selectedRegion) {
  const canvas = page.locator("#imageCanvas");
  const box = await canvas.boundingBox();
  if (!box) {
    return;
  }

  const region = selectedRegion || await page.evaluate(() => {
    const canvasElement = document.querySelector("#imageCanvas");
    const portrait = canvasElement.height >= canvasElement.width;
    if (portrait) {
      return { x: 0.24, y: 0.17, width: 0.57, height: 0.31 };
    }

    return { x: 0.18, y: 0.22, width: 0.68, height: 0.42 };
  });

  const startX = box.x + box.width * region.x;
  const startY = box.y + box.height * region.y;
  const endX = startX + box.width * region.width;
  const endY = startY + box.height * region.height;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await page.locator("#useSelectionButton").click();
  await page.waitForFunction(() => !document.querySelector("#preprocessButton").disabled, null, { timeout: defaultTimeout });
}

function parseArgs(args) {
  const options = {
    clean: false,
    files: [],
    deskew: null,
    headed: false,
    language: null,
    perspective: null,
    pdfPage: 1,
    region: null,
    selectVedomost: true,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--deskew") {
      options.deskew = Number(args[++index] || "0");
    } else if (arg === "--language") {
      options.language = args[++index] || "";
    } else if (arg === "--perspective") {
      options.perspective = parsePerspective(args[++index] || "");
    } else if (arg === "--no-select") {
      options.selectVedomost = false;
    } else if (arg === "--pdf-page") {
      options.pdfPage = Number(args[++index] || "1");
    } else if (arg === "--region") {
      options.region = parseRegion(args[++index] || "");
    } else {
      options.files.push(arg);
    }
  }

  return options;
}

function parseRegion(value) {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("--region must be four comma-separated numbers: x,y,width,height");
  }

  const [x, y, width, height] = parts;
  return { x, y, width, height };
}

function parsePerspective(value) {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 8 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("--perspective must be eight comma-separated numbers: x1,y1,x2,y2,x3,y3,x4,y4");
  }

  return [
    { x: parts[0], y: parts[1] },
    { x: parts[2], y: parts[3] },
    { x: parts[4], y: parts[5] },
    { x: parts[6], y: parts[7] },
  ];
}

async function applyPerspectiveCorrection(page, points) {
  const canvas = page.locator("#imageCanvas");
  const box = await canvas.boundingBox();
  if (!box) {
    return;
  }

  await page.locator("#perspectiveModeButton").click();

  for (const point of points) {
    await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y);
  }

  await page.locator("#applyPerspectiveButton").click();
  await page.waitForFunction(() => !document.querySelector("#preprocessButton").disabled, null, { timeout: defaultTimeout });
}

async function listExampleFiles() {
  const entries = await readDirectory(exampleDir);
  return entries
    .filter((entry) => supportedExtensions.has(extname(entry).toLowerCase()))
    .map((entry) => join(exampleDir, entry))
    .sort((a, b) => a.localeCompare(b));
}

async function readDirectory(path) {
  const { readdir } = await import("node:fs/promises");
  return readdir(path);
}

function createStaticServer(directory) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = join(directory, path);

    try {
      const content = await readFile(filePath);
      response.writeHead(200, { "content-type": getContentType(filePath) });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function getContentType(filePath) {
  if (extname(filePath) === ".js") {
    return "text/javascript";
  }

  if (extname(filePath) === ".css") {
    return "text/css";
  }

  if (extname(filePath) === ".html") {
    return "text/html";
  }

  return "application/octet-stream";
}

function createOutputName(filePath) {
  const name = filePath
    .replace(exampleDir, "")
    .replace(/^[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/^WhatsApp Image 2026-05-19 at 13\.02\./, "")
    .replace(/[^\wа-яА-ЯёЁ]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "actual";

  if (extname(filePath).toLowerCase() === ".pdf") {
    return `PDF_${name}`;
  }

  return name;
}

function findChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
