// Generates test/fixtures/sample.pdf: one page mixing every element the
// recolorer must handle (text, link, highlight, colored table, inverted box,
// vectors, gray ramp, a photo and a diagram image), plus a fake scanned page.
// Deterministic, so screenshots stay comparable. Run: node scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";

const outDir = resolve(import.meta.dirname, "..", "test", "fixtures");

function png(w: number, h: number, fn: (x: number, y: number) => number[]): Buffer {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r = 0, g = 0, b = 0] = fn(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

// Deterministic noise so screenshots stay comparable between runs.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// "Photo": sky gradient, sun, green hills, noise. Rich histogram.
const photo = png(400, 260, (x, y) => {
  const n = (rnd() - 0.5) * 24;
  if ((x - 300) ** 2 + (y - 70) ** 2 < 900) return [255, 220 + n, 80];
  const hill = 170 + 30 * Math.sin(x / 45);
  if (y > hill) return [40 + n, 120 + y / 4 + n, 50 + n];
  return [90 + y / 3 + n, 150 + y / 4 + n, 235 + n / 2];
});

// "Diagram": white background, black axes, gray grid, one blue bar.
const diagram = png(300, 200, (x, y) => {
  if (x === 30 || y === 170) return [0, 0, 0];
  if (y % 35 === 0 && x > 30) return [200, 200, 200];
  if (x > 60 && x < 100 && y > 60 && y < 170) return [30, 80, 200];
  if (x > 130 && x < 170 && y > 100 && y < 170) return [0, 0, 0];
  return [255, 255, 255];
});

// Fake scan: off-white noisy paper with dark "words".
const scan = png(850, 1100, (x, y) => {
  const n = (rnd() - 0.5) * 18;
  const line = Math.floor((y - 80) / 34);
  const inLine = y > 80 && y < 1040 && (y - 80) % 34 < 14;
  const word = Math.floor((x - 70 + line * 13) / 60);
  const inWord = x > 70 && x < 780 && (x - 70 + line * 13) % 60 < 48 && (word + line) % 7 !== 0;
  if (inLine && inWord) return [35 + n, 32 + n, 30 + n];
  return [238 + n / 2, 234 + n / 2, 222 + n / 2];
});

const doc = await PDFDocument.create();
doc.setTitle("NoctPDF phase 0 sample");
// Fixed dates: the file is byte-for-byte reproducible.
doc.setCreationDate(new Date("2026-01-01T00:00:00Z"));
doc.setModificationDate(new Date("2026-01-01T00:00:00Z"));
const helv = await doc.embedFont(StandardFonts.Helvetica);
const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
const times = await doc.embedFont(StandardFonts.TimesRoman);
const page = doc.addPage([595, 842]);

page.drawText("NoctPDF recolor test page", { x: 50, y: 790, size: 22, font: helvB, color: rgb(0, 0, 0) });

// Yellow highlight rectangle behind a sentence.
page.drawRectangle({ x: 48, y: 752, width: 250, height: 15, color: rgb(1, 0.95, 0.3) });
const para = [
  "This sentence sits on a yellow highlight drawn as a vector rectangle.",
  "Body text is plain black Times Roman. The quick brown fox jumps over",
  "the lazy dog. Pack my box with five dozen liquor jugs. Sphinx of black",
  "quartz, judge my vow. 0123456789 (parentheses) [brackets] {braces}.",
];
para.forEach((t, i) => page.drawText(t, { x: 50, y: 756 - i * 16, size: 12, font: times, color: rgb(0, 0, 0) }));

// Blue link with a real link annotation.
page.drawText("https://example.com/a-blue-link", { x: 50, y: 680, size: 12, font: helv, color: rgb(0.05, 0.25, 0.8) });
const link = doc.context.obj({
  Type: "Annot",
  Subtype: "Link",
  Rect: [50, 676, 240, 692],
  Border: [0, 0, 0],
  A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.com/a-blue-link") },
});
page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(link)]));
page.drawText("Red warning text", { x: 280, y: 680, size: 12, font: helvB, color: rgb(0.8, 0.1, 0.1) });
page.drawText("Green ok text", { x: 420, y: 680, size: 12, font: helvB, color: rgb(0.1, 0.55, 0.2) });

// Table with colored cells.
const cells = [
  [rgb(0.25, 0.25, 0.3), rgb(0.25, 0.25, 0.3), rgb(0.25, 0.25, 0.3)],
  [rgb(0.85, 1, 0.85), rgb(1, 0.85, 0.85), rgb(0.85, 0.9, 1)],
  [rgb(1, 1, 1), rgb(1, 0.97, 0.8), rgb(0.95, 0.95, 0.95)],
];
const labels: string[][] = [
  ["Header A", "Header B", "Header C"],
  ["green cell", "red cell", "blue cell"],
  ["white", "cream", "light gray"],
];
cells.forEach((row, r) =>
  row.forEach((c, k) => {
    const x = 50 + k * 120,
      y = 630 - r * 24;
    page.drawRectangle({ x, y, width: 120, height: 24, color: c, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5 });
    page.drawText(labels[r]![k]!, {
      x: x + 8,
      y: y + 8,
      size: 11,
      font: r === 0 ? helvB : helv,
      color: r === 0 ? rgb(1, 1, 1) : rgb(0, 0, 0),
    });
  }),
);

// White text on dark box.
page.drawRectangle({ x: 420, y: 582, width: 130, height: 72, color: rgb(0.1, 0.2, 0.45) });
page.drawText("White text on", { x: 430, y: 630, size: 12, font: helvB, color: rgb(1, 1, 1) });
page.drawText("a dark box", { x: 430, y: 612, size: 12, font: helvB, color: rgb(1, 1, 1) });

// Vector drawing.
page.drawCircle({ x: 90, y: 510, size: 30, borderColor: rgb(0.85, 0.1, 0.1), borderWidth: 3 });
page.drawLine({ start: { x: 140, y: 480 }, end: { x: 240, y: 540 }, thickness: 3, color: rgb(0.1, 0.6, 0.2) });
page.drawSvgPath("M 0 0 L 60 0 L 30 -50 Z", { x: 260, y: 540, color: rgb(1, 0.6, 0.1) });
page.drawRectangle({ x: 340, y: 485, width: 60, height: 50, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });

// Gray ramp, white to black.
for (let i = 0; i <= 10; i++) {
  const v = 1 - i / 10;
  page.drawRectangle({ x: 50 + i * 45, y: 440, width: 45, height: 22, color: rgb(v, v, v) });
}

// Images.
const photoImg = await doc.embedPng(photo);
const diagImg = await doc.embedPng(diagram);
page.drawImage(photoImg, { x: 50, y: 200, width: 260, height: 169 });
page.drawImage(diagImg, { x: 330, y: 200, width: 220, height: 147 });
page.drawText("Photo (should stay a photo)", { x: 50, y: 185, size: 10, font: helv, color: rgb(0.3, 0.3, 0.3) });
page.drawText("Diagram image (auto: invert)", { x: 330, y: 185, size: 10, font: helv, color: rgb(0.3, 0.3, 0.3) });

// Page 2: full-page scan without OCR.
const scanPage = doc.addPage([595, 842]);
scanPage.drawImage(await doc.embedPng(scan), { x: 0, y: 0, width: 595, height: 842 });

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "sample.pdf"), await doc.save());
console.log(`sample.pdf written to ${outDir}`);
