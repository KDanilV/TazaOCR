# OCR Scan Tables

Free browser app for moving tables from scanned images, photos, and PDF pages into editable Excel files.

The public repository intentionally contains only the browser-based scanner. Local Python/model experiments with EasyOCR, PaddleOCR, RapidOCR, Surya, and quality reports are kept out of git and should stay local.

## What It Does

- Opens PDF, PNG, JPG, JPEG, WEBP, and BMP files.
- Runs OCR in the browser with Tesseract.js.
- Uses Russian OCR by default, with optional Russian + English and English modes.
- Lets the user rotate, crop/select a table region, correct perspective, adjust threshold, and fine-tune deskew.
- Detects bordered table grids and OCRs cells into an editable table.
- Supports manual table cleanup: insert/delete rows and columns, merge cells, split cells.
- Exports corrected data to `.xlsx`.

## Run On Windows

Download or clone the repository, then run:

```text
OCRscanTables.exe
```

The launcher starts a local server and opens the app in the browser. Keep the console window open while using the app. Close it to stop the service.

The `.exe` is a small local static-file launcher. It must stay next to `index.html`.

## Run From Source

Use any static HTTP server from the project folder:

```sh
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Do not rely on double-clicking `index.html`; OCR/PDF workers are more reliable over `http://localhost`.

## How To Use

1. Upload a scan, photo, or PDF.
2. For PDF, choose the needed page.
3. If needed, rotate the image.
4. If the table occupies only part of the page, drag over the table and click `Использовать выделение`.
5. If the photo is taken at an angle, use `Режим перспективы`, click the 4 visible corners, then apply perspective correction.
6. Adjust black/white threshold and deskew only if the preview needs it.
7. Click `Выровнять и найти сетку`.
8. Check the green cell overlay.
9. Click `Распознать таблицу`.
10. Correct OCR and structure mistakes manually.
11. Click `Скачать XLSX`.

Use `Распознать текст` as a fallback when grid detection is poor.

## Important Notes

OCR output is always a draft. Review the table before export.

Manual selection, perspective correction, deskew, and threshold changes can improve recognition, but they can also make it worse. If a result gets worse, use `Сбросить скан` and try fewer transformations.

The current scanner works best with:

- printed text;
- visible table borders;
- good lighting and contrast;
- minimal blur;
- minimal perspective distortion.

It is not intended for handwriting or heavily damaged scans.

## Development

Install JavaScript dependencies:

```sh
npm install
```

Run checks:

```sh
npm run check
npm test
```

Build the Windows launcher if you need to regenerate it:

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:OCRscanTables.exe tools\launcher\Program.cs
```

## Local Experiments

The following are intentionally ignored by git:

- `example/`
- `pyproject.toml`
- `uv.lock`
- `scripts/*.py`
- model/cache folders such as `.paddlex-cache*`, `.paddle-home*`, `.surya-cache*`, `.hf-cache*`

Keep OCR model experiments local unless they become part of the main browser workflow.

## License

MIT
