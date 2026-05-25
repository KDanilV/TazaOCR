import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("serves the static app and exposes required controls", async () => {
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/index.html`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /type="module" src="app\.js"/);
    assert.match(html, /pdfjs-dist@4\.10\.38/);
    assert.match(html, /value="rus" selected/);

    for (const id of [
      "imageInput",
      "pdfPageSelect",
      "deskewInput",
      "perspectiveModeButton",
      "applyPerspectiveButton",
      "preprocessButton",
      "recognizeTableButton",
      "recognizeButton",
      "exportButton",
      "imageCanvas",
      "tableWrap",
      "mergeRightButton",
      "mergeDownButton",
      "splitCellButton",
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function createStaticServer(directory) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
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

  return "text/html";
}
