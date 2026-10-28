import test from "node:test";
import assert from "node:assert/strict";
import { pageLayout, pageAtOffset, offsetForPage, inkBounds } from "../dist/continuous-reader.js";
import { contextText, validateDetails, validateProject } from "../dist/model.js";

test("content fitting removes only outer whitespace and retains colored graphics with padding", () => {
  const width = 100, height = 140;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  assert.deepEqual(inkBounds(pixels, width, height), { x: 0, y: 0, w: 1, h: 1 });
  for (let y = 30; y <= 120; y++) for (let x = 20; x <= 80; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = 90; pixels[i + 1] = 150; pixels[i + 2] = 180;
  }
  const box = inkBounds(pixels, width, height);
  assert.ok(box.x < 0.2 && box.x + box.w > 0.8);
  assert.ok(box.y < 30 / 140 && box.y + box.h > 120 / 140);
  assert.ok(box.w < 0.8 && box.h < 0.8);
  pixels.fill(255);
  pixels[(50 * width + 95) * 4] = 0;
  assert.ok(inkBounds(pixels, width, height).w >= 0.65);
});

test("continuous layout keeps portrait and landscape page positions stable", () => {
  const layout = pageLayout([{ width: 600, height: 800 }, { width: 800, height: 600 }, { width: 600, height: 900 }], 300);
  assert.deepEqual(layout, [
    { page: 1, top: 0, height: 400 },
    { page: 2, top: 428, height: 225 },
    { page: 3, top: 681, height: 450 },
  ]);
  assert.deepEqual(pageAtOffset(layout, 540.5), { page: 2, fraction: 0.5 });
  assert.deepEqual(pageAtOffset(layout, -50), { page: 1, fraction: 0 });
  assert.deepEqual(pageAtOffset(layout, 420), { page: 1, fraction: 1 });
  assert.deepEqual(pageAtOffset(layout, 9999), { page: 3, fraction: 1 });
});

test("paired scrolling maps a page and its position across unequal column widths", () => {
  const sizes = Array.from({ length: 41 }, () => ({ width: 612, height: 792 }));
  const en = pageLayout(sizes, 360), zh = pageLayout(sizes, 520);
  for (const page of [1, 2, 20, 41]) {
    const position = { page, fraction: 0.45 };
    const from = pageAtOffset(en, offsetForPage(en, position));
    const mapped = pageAtOffset(zh, offsetForPage(zh, from));
    assert.equal(mapped.page, page);
    assert.ok(Math.abs(mapped.fraction - position.fraction) < 1e-10);
  }
});

test("cross-page excerpts preserve both page anchors through project restore and AI context", () => {
  const segments = [2, 3].map((page) => ({ docId: "paper", side: "en", page, text: `Evidence ${page}`, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }));
  const s = { version: 1, title: "Reader", docs: [{ id: "paper", name: "Paper", type: "pdf", data: "JVBERi0x", pages: 41 }], nodes: [{ id: "quote", title: "Evidence", text: "Evidence 2\nEvidence 3", kind: "quote", x: 0, y: 0, source: { ...segments[0], text: "Evidence 2\nEvidence 3", segments } }], edges: [] };
  const restored = validateDetails(validateProject(JSON.parse(JSON.stringify(s))));
  assert.equal(restored.nodes[0].source.segments[1].page, 3);
  assert.match(contextText(restored, restored.nodes), /第 2–3 页/);
  restored.nodes[0].source.segments[1].page = 99;
  assert.throws(() => validateDetails(restored), /跨页引用/);
});
