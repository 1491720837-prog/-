import * as pdfjs from "./vendor/pdf.mjs";
import { inkBounds } from "./continuous-reader.js";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdf.worker.mjs",
  import.meta.url,
).href;
const documents = new Map();
const pageSizes = new Map();
const contentBoxes = new Map();
const documentData = new Map();
function refreshDocumentCache(doc) {
  if(documentData.get(doc.id)!==doc.data){
    documents.delete(doc.id);pageSizes.delete(doc.id);contentBoxes.delete(doc.id);
    documentData.set(doc.id,doc.data);
  }
}
export async function getContentBoxes(doc) {
  refreshDocumentCache(doc);
  if (!contentBoxes.has(doc.id)) {
    const pending = (async () => {
      const pdf = await loadPDF(doc), boxes = [];
      for (let start = 1; start <= pdf.numPages; start += 2) {
        boxes.push(...await Promise.all(Array.from({ length: Math.min(2, pdf.numPages - start + 1) }, async (_, i) => {
          const page = await pdf.getPage(start + i), raw = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 200 / raw.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          await page.render({ canvasContext: ctx, viewport, background: "white" }).promise;
          const box = inkBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          canvas.width = canvas.height = 0;
          return box;
        })));
      }
      // Use one horizontal crop for the document so type stays the same size.
      const left = Math.min(...boxes.map((b) => b.x));
      const right = Math.max(...boxes.map((b) => b.x + b.w));
      return boxes.map((b) => ({ ...b, x: left, w: right - left }));
    })();
    contentBoxes.set(doc.id, pending);
    pending.catch(() => contentBoxes.delete(doc.id));
  }
  return contentBoxes.get(doc.id);
}
export async function getPageSizes(doc) {
  refreshDocumentCache(doc);
  if (!pageSizes.has(doc.id)) {
    const pending = (async () => {
      const pdf = await loadPDF(doc), sizes = [];
      for (let start = 1; start <= pdf.numPages; start += 16) {
        sizes.push(...await Promise.all(
          Array.from({ length: Math.min(16, pdf.numPages - start + 1) }, async (_, i) => {
            const page = await pdf.getPage(start + i);
            const { width, height } = page.getViewport({ scale: 1 });
            return { width, height };
          }),
        ));
      }
      return sizes;
    })();
    pageSizes.set(doc.id, pending);
    pending.catch(() => pageSizes.delete(doc.id));
  }
  return pageSizes.get(doc.id);
}
export async function loadPDF(doc) {
  refreshDocumentCache(doc);
  if (documents.has(doc.id)) return documents.get(doc.id);
  const data = Uint8Array.from(atob(doc.data), (c) => c.charCodeAt(0));
  const task = pdfjs.getDocument({
    data,
    cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/standard_fonts/", import.meta.url)
      .href,
    wasmUrl: new URL("./vendor/wasm/", import.meta.url).href,
    isEvalSupported: false,
  });
  task.onPassword = () => task.destroy();
  const pdf = await task.promise;
  documents.set(doc.id, pdf);
  return pdf;
}
export async function extractPage(doc, num) {
  const pdf = await loadPDF(doc),
    page = await pdf.getPage(num),
    viewport = page.getViewport({ scale: 1 }),
    content = await page.getTextContent();
  const lines = [];
  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const t = pdfjs.Util.transform(viewport.transform, item.transform),
      h = Math.hypot(t[2], t[3]) || item.height || 10;
    const x = t[4],
      y = t[5] - h,
      w = Math.abs(item.width);
    const last = lines.at(-1);
    if (
      last &&
      Math.abs(last.y - y) < h * 0.35 &&
      x >= last.x + last.w - 3 &&
      x - last.x - last.w < h * 1.8
    ) {
      last.text += " " + item.str;
      last.w = x + w - last.x;
    } else lines.push({ text: item.str, x, y, w, h, font: item.fontName });
  }
  const blocks = [];
  for (const l of lines) {
    const b = blocks.at(-1),
      gap = b ? l.y - (b.y + b.h) : 0;
    const math =
      /[∑∫√=]/.test(l.text) &&
      l.text.replace(/[A-Za-z\s]/g, "").length > l.text.length * 0.25;
    if (
      !math &&
      b &&
      !b.math &&
      Math.abs(l.x - b.x) < 8 &&
      Math.abs(l.h - b.fontSize) < 2 &&
      gap >= -2 &&
      gap < l.h * 0.75
    ) {
      b.text += " " + l.text;
      b.h = l.y + l.h - b.y;
      b.w = Math.max(b.w, l.w);
    } else blocks.push({ ...l, id: "b" + blocks.length, fontSize: l.h, math });
  }
  return {
    page,
    viewport,
    content,
    blocks: blocks.map((b) => ({
      ...b,
      x: b.x / viewport.width,
      y: b.y / viewport.height,
      w: b.w / viewport.width,
      h: b.h / viewport.height,
      fontSize: b.fontSize / viewport.width,
    })),
    width: viewport.width,
    height: viewport.height,
  };
}
export async function renderPDF(doc, num, container) {
  const data = await extractPage(doc, num);
  const width = Math.max(
    260,
    Number(container.dataset.renderWidth) || container.clientWidth || 360,
  );
  const viewport = data.page.getViewport({ scale: width / data.width });
  const sheet = document.createElement("div");
  sheet.className = "pdf-sheet source-page";
  sheet.dataset.page = num;
  sheet.style.width = width + "px";
  sheet.style.height = viewport.height + "px";
  sheet.style.setProperty("--scale-factor", viewport.scale);
  sheet.style.setProperty("--total-scale-factor", viewport.scale);
  const canvas = document.createElement("canvas");
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = width + "px";
  canvas.style.height = viewport.height + "px";
  sheet.append(canvas);
  container.replaceChildren(sheet);
  await data.page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
  }).promise;
  const text = document.createElement("div");
  text.className = "textLayer";
  sheet.append(text);
  const layer = new pdfjs.TextLayer({
    textContentSource: data.content,
    container: text,
    viewport,
  });
  await layer.render();
  sheet.append(
    Object.assign(document.createElement("div"), {
      className: "highlight-layer",
    }),
  );
  return { ...data, sheet, canvas, text };
}
export function renderTranslation(data, translations, container) {
  const width = Math.max(
      260,
      Number(container.dataset.renderWidth) || container.clientWidth || 360,
    ),
    height = (width * data.height) / data.width;
  const sheet = document.createElement("div");
  sheet.className = "pdf-sheet translation-page";
  sheet.style.width = width + "px";
  sheet.style.height = height + "px";
  const canvas = document.createElement("canvas");
  canvas.width = data.canvas.width;
  canvas.height = data.canvas.height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.getContext("2d").drawImage(data.canvas, 0, 0);
  sheet.append(canvas);
  for (const b of data.blocks) {
    if (b.math) continue;
    const el = document.createElement("div");
    el.className = "translation-block";
    el.dataset.block = b.id;
    Object.assign(el.style, {
      left: b.x * 100 + "%",
      top: b.y * 100 + "%",
      width: Math.min(b.w + 0.008, 1 - b.x) * 100 + "%",
      height: Math.max(b.h * height + 3, b.fontSize * width * 1.3) + "px",
      fontSize: Math.max(8, b.fontSize * width) + "px",
    });
    el.textContent = translations[b.id] || b.text;
    if (!translations[b.id]) el.classList.add("untranslated");
    sheet.append(el);
  }
  sheet.append(
    Object.assign(document.createElement("div"), {
      className: "highlight-layer",
    }),
  );
  container.replaceChildren(sheet);
  for (const el of sheet.querySelectorAll(".translation-block")) {
    let size = parseFloat(el.style.fontSize);
    while (
      (el.scrollHeight > el.clientHeight + 2 ||
        el.scrollWidth > el.clientWidth + 2) &&
      size > 8
    ) {
      size -= 0.4;
      el.style.fontSize = size + "px";
    }
    if (el.scrollHeight > el.clientHeight + 2) {
      el.classList.add("text-overflow");
      el.title = "译文较长，滚动此段查看完整内容";
    }
  }
  return sheet;
}
export function arrayBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 32768)
    out += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(out);
}
