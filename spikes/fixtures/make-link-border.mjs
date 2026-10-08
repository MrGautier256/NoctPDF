// Generates spikes/fixtures/link-border.pdf: a hyperref-style link with a
// visible colored border (bright green, like the arXiv capture from the
// phase 0 review), for the phase 2 fix. The real arxiv.org PDF could not be
// fetched from this sandboxed session (outbound network policy denies
// arxiv.org); this reproduces the structure PDF.js' AnnotationLayer reads
// (/C border color, /BS width) without needing network access.
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";

const here = new URL(".", import.meta.url);
const doc = await PDFDocument.create();
doc.setTitle("NoctPDF link-border fixture");
const helv = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([400, 200]);

page.drawText("Plain text for contrast.", { x: 40, y: 150, size: 14, font: helv, color: rgb(0, 0, 0) });
page.drawText("A hyperref-style green-bordered link", { x: 40, y: 110, size: 14, font: helv, color: rgb(0.05, 0.25, 0.8) });

const ctx = doc.context;
const link = ctx.obj({
  Type: "Annot",
  Subtype: "Link",
  Rect: [38, 105, 300, 124],
  Border: [0, 0, 1],
  BS: ctx.obj({ W: 1, S: "S" }),
  C: [0, 1, 0],
  A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.com/hyperref-style-link") },
});
page.node.set(PDFName.of("Annots"), ctx.obj([ctx.register(link)]));

writeFileSync(new URL("link-border.pdf", here), await doc.save());
console.log("link-border.pdf written");
