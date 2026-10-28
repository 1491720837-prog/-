import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const d = await PDFDocument.create(),
  font = await d.embedFont(StandardFonts.TimesRoman),
  bold = await d.embedFont(StandardFonts.TimesRomanBold);
for (let i = 0; i < 2; i++) {
  const p = d.addPage([612, 792]);
  p.drawText("A study of active reading", {
    x: 52,
    y: 728,
    font: bold,
    size: 22,
  });
  p.drawText("Testing article - page " + (i + 1), {
    x: 52,
    y: 699,
    font,
    size: 12,
  });
  p.drawText("Abstract", { x: 52, y: 655, font: bold, size: 15 });
  p.drawText("Reading connects new ideas with existing knowledge.", {
    x: 52,
    y: 630,
    font,
    size: 13,
  });
  p.drawText("A useful note preserves the path back to its evidence.", {
    x: 52,
    y: 610,
    font,
    size: 13,
  });
  p.drawText("Research methods", { x: 52, y: 566, font: bold, size: 15 });
  p.drawText("We compare two groups of readers over four weeks.", {
    x: 52,
    y: 541,
    font,
    size: 13,
  });
  p.drawRectangle({
    x: 70,
    y: 250,
    width: 450,
    height: 220,
    color: rgb(0.93, 0.96, 0.91),
  });
  for (let n = 0; n < 4; n++)
    p.drawRectangle({
      x: 100 + n * 100,
      y: 270,
      width: 45,
      height: 50 + n * 35,
      color: rgb(0.4, 0.6, 0.45),
    });
  p.drawText("Figure 1. Reading outcomes for four groups.", {
    x: 70,
    y: 226,
    font,
    size: 12,
  });
  p.drawText("The figure shows a difference, not a causal conclusion.", {
    x: 52,
    y: 178,
    font,
    size: 13,
  });
}
await writeFile("artifacts/reading-fixture.pdf", await d.save());
