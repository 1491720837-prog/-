import {deviceHeaders} from './cloud-storage.js';
import {isCloud,cloudRefresh,preserveCloudDraft} from './cloud-storage.js';
import {
  uid,
  ancestors,
  descendants,
  setParent,
  appearance,
  visibleNodes,
  scopeNodes,
  contextText,
  validateProject,
  validateDetails,
  pairedTranslation,
  sourceCitation,
  markdown,
  readSaved,
  writeSaved,
  writeFeishuProject,
  listSavedProjects,
  readSavedProject,
  activateSavedProject,
} from "./model.js";
import {
  loadPDF,
  extractPage,
  renderPDF,
  renderTranslation,
  arrayBase64,
  getPageSizes,
  getContentBoxes,
} from "./pdf-reader.js";
import { PageStack } from "./continuous-reader.js";
import { capturePageRegion } from "./image-tools.js";
import { connectionFromPort, planConnection, planDisconnect, endpointGrip, portPoint, connectionCurve } from "./connections.js";
import { mindmapLayout, nextNodePosition } from "./mindmap-layout.js";
import { mountModelPicker } from "./model-picker.js";
import { createInlineEditor } from "./inline-edit.js";
import { collectLiterature } from "./literature.js";
import { detectDocumentLanguage, translationRequest, waitForTranslation } from "./full-translation.js";
import { askAI, askCodex, parseJSON, readingSystem, translateBlocks } from "./ai.js";
import {answerComment,readingPreferences} from "./feishu-comments.js";
import { createFeishuSync } from "./feishu-sync.js";
import { mergeFeishuChanges } from "./feishu-merge.js";
import { createDemo, demoSections } from "./demo.js";
import { download, zip, canvasImage } from "./export.js";
const $ = (q, r = document) => r.querySelector(q),
  $$ = (q, r = document) => [...r.querySelectorAll(q)];
const icons = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  book: "M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1",
  file: "M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8zM14 2v6h6M8 13h8M8 17h6",
  layers: "m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 18l9 5 9-5",
  spark:
    "m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7ZM20 2v4M18 4h4",
  message: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8ZM7 10h10M7 14h6",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  crop: "M6 2v16h16M2 6h16v16",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevronDown: "m6 9 6 6 6-6",
  chevronLeft: "m15 5-7 7 7 7",
  chevronRight: "m9 5 7 7-7 7",
  panel: "M3 3h18v18H3ZM12 3v18",
  link: "m10 13 4-4M8 15l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  image: "M3 3h18v18H3Zm0 14 6-6 4 4 3-3 5 5M17 7h.01",
  undo: "M3 10h10a7 7 0 0 1 0 14M3 10l6-6M3 10l6 6",
  redo: "M21 10H11a7 7 0 0 0 0 14M21 10l-6-6M21 10l-6 6",
  maximize: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  minimize: "M3 8h5V3M16 3v5h5M8 21v-5H3M21 16h-5v5",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  quote: "M9 5H3v8h6V5Zm0 8c0 4-2 6-5 6M21 5h-6v8h6V5Zm0 8c0 4-2 6-5 6",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.file}"/></svg>`;
}
function hydrate(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    delete el.dataset.icon;
  });
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
let state;
try {
  const saved = await readSaved();
  state = saved ? validateDetails(validateProject(saved)) : createDemo();
} catch (e) {
  if(isCloud){document.body.textContent="云端项目读取失败，未打开或覆盖任何项目。请刷新重试："+e.message;throw e;}
  state = createDemo();
  setTimeout(
    () => toast("未能读取本地存档，已打开示例。可以通过导入项目备份恢复。"),
    1000,
  );
}
state.config ||= { endpoint: "/api/chat", model: "" };
state.config.readingProvider ||= isCloud ? "api" : "codex";
state.view ||= { x: 25, y: 25, scale: 0.76 };
state.shortcuts ||= [];
state.questionGroups ||= [];
let selected = new Set(),
  activeExcerpt = null,
  excerptMode = "quote",
  excerptTitleCheckpointed = false,
  excerptPopupAnchor = null,
  renderEpoch = 0,
  readerStacks = { en: null, zh: null },
  readerDocId = null,
  readerRestorePosition = null,
  readerSaveTimer,
  translationTarget = null,
  importingTranslation = false,
  sync = true,
  readerZoom = Math.max(0.75, Math.min(3, Number(state.reader?.zoom) || 1)),
  readerFitContent = state.reader?.fitContent !== false,
  readerZoomTimer,
  undoStack = [],
  redoStack = [],
  saveTimer,
  toastTimer,
  crop = null,
  translationAbort = null,
  connection = null,
  selectedEdgeKey = null,
  drag = null,
  nodeWasDragged = false,
  editorId = null,
  searchIndex = 0;
const busy = new Map();
const aiProgress = new Map();
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").classList.remove("hidden");
  toastTimer = setTimeout(() => $("#toast").classList.add("hidden"), 5000);
}
function save() {
  const workspace=state;
  clearTimeout(saveTimer);
  $("#save-status").innerHTML = "<i></i> 保存中…";
  saveTimer = setTimeout(async () => {
    try {
      await writeSaved(workspace);
      $("#save-status").innerHTML = isCloud ? "<i></i> 已保存到云端" : "<i></i> 已保存到本机";
    } catch (e) {
      $("#save-status").textContent = "保存失败";
      toast(isCloud ? e.message+" 可在「在线与本机」下载浏览器草稿。" : "本地空间不足或浏览器禁止存储，请导出项目备份。");
    }
  }, 300);
}
function checkpoint() {
  undoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}
function changed() {
  renderCanvas();
  save();
}
function currentDoc() {
  return state.docs.find((d) => d.id === state.activeDoc) || state.docs[0];
}
function getNode(id) {
  return state.nodes.find((n) => n.id === id);
}
function imagePreview(n) {
  return n.image ? `<button class="node-image-button" data-view-image="${esc(n.id)}" title="点击查看大图" aria-label="查看大图：${esc(n.title)}"><img class="node-image" src="${n.image}" alt="${esc(n.title)}" draggable="false"></button>` : "";
}
let imageViewerScale = 1, imageViewerToken = 0;
function resizeImagePreview(scale) {
  const image = $("#image-viewer-image");
  imageViewerScale = Math.max(0.01, Math.min(8, scale));
  image.style.width = image.naturalWidth * imageViewerScale + "px";
  $("#image-viewer-scale").textContent = Math.round(imageViewerScale * 100) + "%";
}
function fitImagePreview() {
  const image = $("#image-viewer-image"), viewport = $("#image-viewer-viewport");
  if (!image.naturalWidth) return;
  resizeImagePreview(Math.min(1, (viewport.clientWidth - 32) / image.naturalWidth, (viewport.clientHeight - 32) / image.naturalHeight));
  viewport.scrollTo(0, 0);
}
async function openImagePreview(id) {
  const n = getNode(id);
  if (!n?.image) return;
  const dialog = $("#image-viewer"), image = $("#image-viewer-image"), token = ++imageViewerToken;
  $("#image-viewer-title").textContent = n.title || "查看大图";
  $("#image-viewer-caption").textContent = "正在加载图片…";
  image.style.visibility = "hidden";
  image.src = n.image;
  image.alt = n.title || "图片节点";
  dialog.showModal();
  try {
    await image.decode();
    if (token !== imageViewerToken || !dialog.open) return;
    fitImagePreview();
    image.style.visibility = "visible";
    $("#image-viewer-caption").textContent = `${image.naturalWidth} × ${image.naturalHeight} 像素` + (n.source ? " · " + sourceCitation(state, n.source) : "");
  } catch {
    if (token === imageViewerToken) $("#image-viewer-caption").textContent = "图片无法加载，请关闭后重试。";
  }
}
function modal(title, body, footer = "") {
  const el = $("#modal");
  el.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button modal-close" aria-label="关闭">${icon("close")}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ""}`;
  $(".modal-close", el).onclick = () => el.close();
  if (!el.open) el.showModal();
  hydrate(el);
  return el;
}
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const b = e.target.getBoundingClientRect();
    if (
      e.clientX < b.left ||
      e.clientX > b.right ||
      e.clientY < b.top ||
      e.clientY > b.bottom
    )
      e.target.close();
  }
});
let disposeModelPicker;
function openDrawer(title, body, bottom = "") {
  disposeModelPicker?.(); disposeModelPicker=null;
  const el = $("#drawer");
  el.innerHTML = `<div class="drawer-head"><h2>${esc(title)}</h2><button id="close-drawer" class="icon-button" aria-label="关闭侧栏">${icon("close")}</button></div><div class="drawer-body">${body}</div>${bottom ? `<div class="drawer-bottom">${bottom}</div>` : ""}`;
  el.classList.remove("hidden");
  $("#close-drawer").onclick = closeDrawer;
  hydrate(el);
  return el;
}
function closeDrawer() {
  disposeModelPicker?.(); disposeModelPicker=null;
  $("#drawer").classList.add("hidden");
  editorId = null;
}
function figureSVG(zh = false) {
  const words = zh
    ? ["观察", "提问", "关联", "回顾"]
    : ["Observe", "Question", "Connect", "Revisit"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="180" viewBox="0 0 500 180"><rect width="500" height="180" rx="12" fill="#f2f5e9"/><path d="M95 90H410" stroke="#bac8a7" stroke-width="2" stroke-dasharray="4 4"/>${words.map((w, i) => `<circle cx="${65 + i * 123}" cy="80" r="26" fill="${["#dee8cd", "#e3e9d6", "#e9e2cf", "#dedfe7"][i]}" stroke="#c2cdb1"/><text x="${65 + i * 123}" y="85" text-anchor="middle" fill="#6e8059" font-family="sans-serif" font-size="14">0${i + 1}</text><text x="${65 + i * 123}" y="134" text-anchor="middle" fill="#7c876b" font-family="sans-serif" font-size="13">${w}</text>`).join("")}</svg>`;
}
function renderDemo(side) {
  const article = document.createElement("article");
  article.className =
    "demo-paper " +
    (side === "zh" ? "zh" : "") +
    " " +
    (side === "zh" ? "translation-page" : "source-page");
  for (const s of demoSections) {
    let el;
    if (s.type === "figure") {
      el = document.createElement("div");
      el.className = "demo-figure";
      el.innerHTML = figureSVG(side === "zh");
      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-folio-figure", side);
      });
      el.title = "拖到画布，生成图片节点";
    } else {
      const tags = { title: "h1", heading: "h2", quote: "blockquote", p: "p" };
      el = document.createElement(tags[s.type] || "div");
      el.className = s.type === "footer" ? "paper-footer" : s.type;
      el.textContent = s[side];
    }
    if (s.id) el.dataset.section = s.id;
    article.append(el);
  }
  article.append(
    Object.assign(document.createElement("div"), {
      className: "highlight-layer",
    }),
  );
  return article;
}
function updateReaderPosition() {
  const d = currentDoc();
  const page = readerStacks.en?.position().page || state.page;
  if (state.page !== page) {
    state.page = page;
    searchIndex = 0;
    clearTimeout(readerSaveTimer);
    readerSaveTimer = setTimeout(save, 600);
  }
  if (document.activeElement !== $("#page-input")) $("#page-input").value = page;
  $("#page-total").textContent = "/ " + d.pages;
  $("#prev-page").disabled = page <= 1;
  $("#next-page").disabled = page >= d.pages;
  if (d.type === "pdf" && readerStacks.zh) {
    const zhPage = readerStacks.zh.position().page;
    $("#translation-status").textContent = d.translationPDF
      ? `中文译本 · ${d.translationPDF.name} · 第 ${zhPage} 页`
      : `第 ${zhPage} 页 · ${d.translations?.[zhPage]?.blocks ? "已翻译" : "待翻译"}`;
  }
}
async function renderReader() {
  const d = currentDoc();
  if (!d) return;
  const positions = readerDocId === d.id && readerStacks.en ? {
    en: readerStacks.en?.position(), zh: readerStacks.zh?.position(),
    enX: $("#english-scroll").scrollLeft / Math.max(1, $("#english-scroll").scrollWidth - $("#english-scroll").clientWidth),
    zhX: $("#chinese-scroll").scrollLeft / Math.max(1, $("#chinese-scroll").scrollWidth - $("#chinese-scroll").clientWidth),
  } : readerDocId === d.id ? (readerRestorePosition || {}) : {};
  readerRestorePosition = positions;
  const epoch = ++renderEpoch;
  readerStacks.en?.destroy();
  readerStacks.zh?.destroy();
  readerStacks = { en: null, zh: null };
  readerDocId = d.id;
  stopCrop();
  $("#document-name").textContent = d.name;
  updateReaderPosition();
  updateZoomControls();
  for (const el of $$(".reader-scroll")) el.classList.toggle("fit-content", d.type === "pdf" && readerFitContent);
  $("#english-paper").style.width = readerZoom * 100 + "%";
  $("#chinese-paper").style.width = readerZoom * 100 + "%";
  $("#translate-button").disabled = d.type === "demo" || !!d.translationPDF;
  $("#import-translation").innerHTML = icon("file") + (d.translationPDF ? "管理中文译本" : "导入中文译本");
  $("#translation-status").textContent =
    d.type === "demo" ? "示例译文 · 与原文对照" : "同版式译文 · 待翻译";
  if (d.type === "demo") {
    $("#english-paper").replaceChildren(renderDemo("en"));
    $("#chinese-paper").replaceChildren(renderDemo("zh"));
  } else if (d.type === "text") {
    const en = document.createElement("article");
    en.className = "demo-paper source-page";
    const h = document.createElement("h1");
    h.textContent = d.name;
    en.append(h);
    for (const [i, p] of d.text.split(/\n\s*\n/).entries()) {
      const el = document.createElement("p");
      el.textContent = p;
      el.dataset.section = "t" + i;
      en.append(el);
    }
    en.append(Object.assign(document.createElement("div"), { className: "highlight-layer" }));
    $("#english-paper").replaceChildren(en);
    renderTextTranslation(d);
  } else {
    $("#english-paper").textContent = "正在准备连续阅读…";
    $("#chinese-paper").textContent = "正在准备中文对照…";
    try {
      const sizes = await getPageSizes(d);
      const zhSizes = d.translationPDF ? await getPageSizes(d.translationPDF) : sizes;
      let boxes;
      if (readerFitContent) {
        $("#english-paper").textContent = "正在识别正文范围，去除白边…";
        const [originalBoxes, translatedBoxes] = await Promise.all([
          getContentBoxes(d), d.translationPDF ? getContentBoxes(d.translationPDF) : Promise.resolve(null),
        ]);
        boxes = originalBoxes.map((a, i) => {
          const b = translatedBoxes?.[i] || a;
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
        });
      }
      if (epoch !== renderEpoch) return;
      const mounted = (page, data) => {
        if (epoch !== renderEpoch) return;
        updateReaderPosition();
        renderHighlights();
        const side = data.sheet.classList.contains("source-page") ? "en" : "zh";
        if (crop === side && data.canvas) attachCropOverlay(data, side);
      };
      const enStack = readerStacks.en = new PageStack({
        host: $("#english-paper"), scroll: $("#english-scroll"), sizes, boxes,
        render: (page, stage) => renderPDF(d, page, stage), onMount: mounted,
      });
      const zhStack = readerStacks.zh = new PageStack({
        host: $("#chinese-paper"), scroll: $("#chinese-scroll"), sizes: zhSizes, boxes,
        render: async (page, stage) => {
          if (d.translationPDF) {
            const rendered = await renderPDF(d.translationPDF, page, stage);
            rendered.sheet.classList.replace("source-page", "translation-page");
            return rendered;
          }
          const blocks = d.translations?.[page]?.blocks;
          if (!blocks) return { sheet: untranslatedPage(page) };
          // A detached original canvas also allows independent Chinese scrolling.
          const originalStage = document.createElement("div");
          originalStage.dataset.renderWidth = stage.dataset.renderWidth;
          const original = await renderPDF(d, page, originalStage);
          const sheet = renderTranslation(original, blocks, stage);
          sheet.dataset.page = page;
          original.canvas.width = original.canvas.height = 0;
          return { ...original, sheet, canvas: sheet.querySelector("canvas") };
        }, onMount: mounted,
      });
      const start = positions.en || { page: state.page, fraction: 0 };
      enStack.scrollTo(start, positions.en ? undefined : (readerFitContent ? 12 : 21));
      zhStack.scrollTo((sync ? positions.en : positions.zh) || start, positions.zh ? undefined : (readerFitContent ? 12 : 21));
      $("#english-scroll").scrollLeft = (positions.enX || 0) * Math.max(0, $("#english-scroll").scrollWidth - $("#english-scroll").clientWidth);
      $("#chinese-scroll").scrollLeft = (positions.zhX || 0) * Math.max(0, $("#chinese-scroll").scrollWidth - $("#chinese-scroll").clientWidth);
      readerRestorePosition = null;
      await Promise.all([enStack.ensure(start.page, true), zhStack.ensure(zhStack.position().page, true)]);
    } catch (e) {
      if (epoch === renderEpoch) {
        $("#english-paper").textContent = "文档无法打开：" + e.message;
        toast("无法解析 PDF。加密文件请先解除密码，或换一个文件。");
      }
    }
  }
  if (epoch !== renderEpoch) return;
  renderHighlights();
  attachReaderEvents();
}
function untranslatedPage(page) {
  const sheet = document.createElement("div");
  sheet.className = "translation-placeholder untranslated-page";
  sheet.innerHTML = `${icon("spark")}<h3>第 ${page} 页 · 等待中文译文</h3><p>导入已有的中文版，或连接模型翻译全文。<br>上下滚动可继续阅读其他页面。</p>`;
  const importButton = document.createElement("button");
  importButton.className = "button primary";
  importButton.textContent = "导入中文译本";
  importButton.onclick = openTranslationImport;
  const translateButton = document.createElement("button");
  translateButton.className = "button";
  translateButton.textContent = "AI 翻译全文";
  translateButton.onclick = translateDocument;
  sheet.append(importButton, document.createElement("br"), translateButton);
  return sheet;
}
function translationEmpty() {
  const d = currentDoc();
  $("#chinese-paper").innerHTML =
    `<div class="translation-placeholder">${icon("spark")}<h3>让英文论文，用中文展开</h3><p>已有中文版？导入后在这里逐页对照。<br>也可以连接模型服务，自动翻译全文。</p>${d.type === "pdf" ? '<button class="button primary" id="start-import-translation">导入已有中文 PDF</button><br>' : ""}<button class="button" id="start-translation">AI 翻译这篇文献</button><p>导入的译本保存在本机；仅 AI 翻译会发送文档内容。</p></div>`;
  $("#start-translation").onclick = translateDocument;
  if ($("#start-import-translation")) $("#start-import-translation").onclick = openTranslationImport;
}
async function renderChinesePDF(page = state.page) {
  await readerStacks.zh?.invalidate(page);
  updateReaderPosition();
}
function renderTextTranslation(d) {
  const t = d.translations?.[1];
  if (!t?.blocks) return translationEmpty();
  const zh = document.createElement("article");
  zh.className = "demo-paper zh translation-page";
  const h = document.createElement("h1");
  h.textContent = d.name;
  zh.append(h);
  for (const [i] of d.text.split(/\n\s*\n/).entries()) {
    const p = document.createElement("p");
    p.textContent = t.blocks["t" + i] || "";
    p.dataset.section = "t" + i;
    zh.append(p);
  }
  zh.append(
    Object.assign(document.createElement("div"), {
      className: "highlight-layer",
    }),
  );
  $("#chinese-paper").replaceChildren(zh);
  $("#translation-status").textContent = "已翻译 · 段落对照";
}
async function translateDocument() {
  const workspace = state;
  const d = currentDoc();
  if (d.type === "demo" || d.translationPDF) return;
  if(d.type === "pdf") return translateFullPDF(d,workspace);
  if (translationAbort) {
    translationAbort.abort();
    return;
  }
  translationAbort = new AbortController();
  const controller = translationAbort;
  d.translations ||= {};
  $("#translate-button").textContent = "取消翻译";
  $("#translation-progress").classList.remove("hidden");
  let done = 0;
  try {
    for (let p = 1; p <= d.pages; p++) {
      if (controller.signal.aborted) throw new Error("已取消翻译");
      if (d.translations[p]?.blocks) {
        done++;
        continue;
      }
      $("#translation-progress").textContent =
        `正在翻译第 ${p} / ${d.pages} 页… 可继续阅读`;
      const data =
        d.type === "pdf"
          ? await extractPage(d, p)
          : {
              blocks: d.text
                .split(/\n\s*\n/)
                .map((text, i) => ({ id: "t" + i, text })),
            };
      const blocks = data.blocks.filter((b) => !b.math);
      if (!blocks.length)
        throw new Error(`第 ${p} 页未检测到可翻译文字，扫描版需要先进行 OCR。`);
      const translated = await translateBlocks(blocks, state.config, controller.signal);
      if (state !== workspace || controller.signal.aborted || d.translationPDF) return;
      d.translations[p] = { blocks: translated };
      done++;
      save();
      if (currentDoc().id === d.id) {
        if (d.type === "pdf") await renderChinesePDF(p);
        else renderTextTranslation(d);
        renderHighlights();
        attachReaderEvents();
      }
    }
    toast("全文翻译完成");
  } catch (e) {
    if (state !== workspace || controller.signal.aborted || d.translationPDF) return;
    toast(e.message);
    $("#translation-status").textContent =
      `已完成 ${done} / ${d.pages} 页 · 可继续翻译`;
  } finally {
    if (translationAbort === controller) {
      translationAbort = null;
      $("#translate-button").innerHTML = icon("spark") + "翻译全文";
      $("#translation-progress").classList.add("hidden");
    }
  }
}
async function translateFullPDF(d,workspace,{resume=false}={}) {
  if(translationAbort){translationAbort.abort();return;}
  const controller=new AbortController();translationAbort=controller;
  const progress=$("#translation-progress");progress.classList.remove('hidden');
  $("#translate-button").textContent='取消翻译';
  let id=d.fullTranslation?.id,serverCompleted=false;
  const cancel=()=>{if(id)translationRequest(`jobs/${id}/cancel`,{}).catch(()=>{});};
  controller.signal.addEventListener('abort',cancel,{once:true});
  try {
    progress.textContent='正在保存项目并准备完整翻译…';
    await writeSaved(workspace);
    if(!resume){
      const job=id?await translationRequest(`jobs/${id}/retry`,{}):await translationRequest('jobs',{name:d.name,data:d.data,projectId:workspace.projectId,docId:d.id,model:workspace.config?.codexModel});
      id=job.id;d.fullTranslation={id,status:job.status};await writeSaved(workspace);
    }
    if(controller.signal.aborted){cancel();return;}
    const result=await waitForTranslation(id,{signal:controller.signal,onProgress:job=>{
      d.fullTranslation={id,status:job.status,message:job.message};progress.textContent=job.message;
    }});
    if(controller.signal.aborted||result.projectId!==workspace.projectId||result.docId!==d.id||!workspace.docs.includes(d))return;
    if(isCloud&&result.cloudSaved){
      serverCompleted=true;await preserveCloudDraft(workspace);
      const next=await cloudRefresh(workspace);
      if(!next)throw Error('中文 PDF 已保存到云端，当前还有待合并的修改。请先在「在线与本机」下载浏览器草稿，再刷新查看译本。');
      if(state===workspace){state=next;await renderReader();renderCanvas();}
      toast('完整中文 PDF 已保存到云端并配对，所有内置图均已检查');return;
    }
    if(d.translationPDF)throw Error('已有中文译本，保留现有配对；新译本仍保存在本机翻译任务中');
    d.translationPDF=pairedTranslation(d,{...result,type:'pdf'});
    d.fullTranslation={id,status:'complete',report:result.report};
    await writeSaved(workspace);
    if(state===workspace&&currentDoc()===d)await renderReader();
    toast('完整中文 PDF 已放入中文栏，正文和所有内置图片均已检查');
  }catch(e){
    if(!serverCompleted){d.fullTranslation={id,status:controller.signal.aborted?'cancelled':'failed',message:e.message};await writeSaved(workspace).catch(()=>{});}
    toast(controller.signal.aborted?'已取消翻译，原文和已有笔记保留':e.message);
    $("#translation-status").textContent=serverCompleted?'译本已在云端 · 请处理本机草稿后刷新':'完整翻译未完成 · 可点击翻译重试';
  }finally{
    controller.signal.removeEventListener('abort',cancel);
    if(translationAbort===controller){translationAbort=null;progress.classList.add('hidden');$("#translate-button").innerHTML=icon('spark')+'翻译全文';}
  }
}
async function offerFullTranslation(d,workspace,language,previous) {
  return new Promise(resolve=>{
    modal(language==='en'?'检测到英文文献':'是否生成完整中文版？',
      `<p>「${esc(d.name)}」· ${d.pages} 页</p><p>翻译正文、表格、图注、附录及每张图片里的英文，生成与原文逐页对应的中文 PDF，完成检查后自动放入中文栏。</p><p>使用本机已登录的 Codex 和当前所选模型，会发送这份文献的文字与图片供翻译和检查，并使用账户额度。可以继续阅读，失败时保留原文。</p><label><input type="checkbox" id="translation-new-project" checked> 为这篇文献建立独立项目，保存当前项目和导图</label>`,
      '<button class="button" id="skip-full-translation">暂不翻译</button><button class="button primary" id="accept-full-translation">生成完整中文版</button>');
    let accepted=false;
    $("#modal").addEventListener('close',()=>{if(!accepted)resolve(false);},{once:true});
    $("#skip-full-translation").onclick=()=>$("#modal").close();
    $("#accept-full-translation").onclick=async()=>{
      accepted=true;const separate=$("#translation-new-project").checked;$("#modal").close();
      try{
        if(state!==workspace)throw Error('项目已切换，请在目标文献中重新开始翻译');
        if(separate){
          const next=createDemo();next.title=d.name;next.docs=[structuredClone(d)];next.nodes=[];next.edges=[];next.activeDoc=d.id;next.page=1;next.canvasLayout='mindmap-lr-v1';next.view={x:25,y:25,scale:.76};
          // This document was just imported for this prompt; restore the prior project exactly.
          workspace.docs=workspace.docs.filter(doc=>doc!==d);workspace.activeDoc=previous.activeDoc;workspace.page=previous.page;
          try{await switchProject(next);}catch(e){workspace.docs.push(d);workspace.activeDoc=d.id;workspace.page=1;throw e;}
          await translateFullPDF(currentDoc(),state);
        }else await translateFullPDF(d,workspace);
      }catch(e){toast(e.message);}finally{resolve(true);}
    };
  });
}
function attachReaderEvents() {
  for (const [id, side] of [
    ["#english-paper", "en"],
    ["#chinese-paper", "zh"],
  ]) {
    const el = $(id);
    el.onpointerup = (e) => {
      if (crop !== side && !e.target.closest(".crop-overlay") && e.button === 0)
        setTimeout(() => captureSelection(e, side), 0);
    };
  }
}
function rectsForRange(range, sheet) {
  const b = sheet.getBoundingClientRect();
  return [...range.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => ({
      x: (r.left - b.left) / b.width,
      y: (r.top - b.top) / b.height,
      w: r.width / b.width,
      h: r.height / b.height,
    }));
}
function sourceForRange(range, sheet, side) {
  const text = range.toString().trim();
  const section = range.startContainer.parentElement.closest(
    "[data-section],[data-block]",
  );
  const rects = rectsForRange(range, sheet);
  const d = currentDoc();
  const page = Number(sheet.dataset.page) || 1;
  const pagePDF = readerStacks.en?.get(page) || (!d.translationPDF && readerStacks.zh?.get(page));
  let original = text,
    translation = "";
  if (side === "zh") {
    translation = text;
    if (d.type === "demo")
      original =
        demoSections.find((s) => s.id === section?.dataset.section)?.en || text;
    else if (d.type === "text")
      original =
        d.text.split(/\n\s*\n/)[Number(section?.dataset.section?.slice(1))] ||
        text;
    else
      original =
        pagePDF?.blocks.find((b) => b.id === section?.dataset.block)?.text ||
        text;
  } else if (d.type === "demo")
    translation =
      demoSections.find((s) => s.id === section?.dataset.section)?.zh || "";
  else if (d.type === "pdf") {
    const hit = pagePDF?.blocks.find((b) =>
      rects.some(
        (r) =>
          r.y >= b.y - 0.01 &&
          r.y <= b.y + b.h + 0.01 &&
          r.x >= b.x - 0.02 &&
          r.x <= b.x + b.w,
      ),
    );
    translation = d.translations?.[page]?.blocks[hit?.id] || "";
  } else if (d.type === "text")
    translation = d.translations?.[1]?.blocks[section?.dataset.section] || "";
  let blockIds = [];
  if (d.type === "pdf" && !d.translationPDF) {
    if (side === "zh") {
      blockIds = [...sheet.querySelectorAll("[data-block]")]
        .filter((el) => range.intersectsNode(el))
        .map((el) => el.dataset.block);
      original = pagePDF.blocks
        .filter((b) => blockIds.includes(b.id))
        .map((b) => b.text)
        .join("\n");
    } else {
      blockIds = pagePDF.blocks
        .filter((b) =>
          rects.some(
            (r) =>
              r.x < b.x + b.w + 0.005 &&
              r.x + r.w > b.x - 0.005 &&
              r.y < b.y + b.h + 0.005 &&
              r.y + r.h > b.y - 0.005,
          ),
        )
        .map((b) => b.id);
      translation = blockIds
        .map((id) => d.translations?.[page]?.blocks[id] || "")
        .filter(Boolean)
        .join("\n");
    }
  }
  let anchor = null;
  if (d.translationPDF) {
    original = text;
    translation = "";
    blockIds = [];
  }
  if (d.type !== "pdf") {
    const before = document.createRange();
    before.selectNodeContents(sheet);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    anchor = { start, end: start + range.toString().length };
  }
  return {
    docId: d.id,
    page,
    text: original,
    translation,
    selectedText: text,
    side,
    anchor,
    section: section?.dataset.section,
    block: section?.dataset.block,
    blockIds,
    rects,
    ...(side === "zh" && d.translationPDF ? {
      translationPDFId: d.translationPDF.id,
      translationPDFName: d.translationPDF.name,
    } : {}),
  };
}
function captureSelection(e, side) {
  const selection = getSelection(),
    host = $(side === "en" ? "#english-paper" : "#chinese-paper");
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return;
  if (!selection.toString().trim() || selection.isCollapsed) {
    locateHighlight(e, side);
    return;
  }
  const sources = [];
  for (const sheet of host.querySelectorAll(".source-page,.translation-page")) {
    if (!range.intersectsNode(sheet)) continue;
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.textContent.trim() && !node.parentElement.closest(".highlight-layer,.crop-overlay")
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const first = walker.nextNode();
    if (!first) continue;
    let last = first, next;
    while ((next = walker.nextNode())) last = next;
    const bounds = document.createRange();
    // Clip to text, rather than the canvas beneath it, at a page boundary.
    bounds.setStart(first, 0);
    bounds.setEnd(last, last.textContent.length);
    const part = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
      part.setStart(bounds.startContainer, bounds.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
      part.setEnd(bounds.endContainer, bounds.endOffset);
    if (part.toString().trim()) sources.push(sourceForRange(part, sheet, side));
  }
  if (!sources.length) return;
  const text = sources.map((s) => s.selectedText).join("\n");
  const source = sources.length === 1 ? sources[0] : {
    ...sources[0], selectedText: text,
    text: sources.map((s) => s.text).join("\n"),
    translation: sources.map((s) => s.translation).filter(Boolean).join("\n"),
    segments: sources,
  };
  checkpoint();
  const n = makeNode(
    {
      kind: "quote",
      title: text,
      text,
      source,
    },
    selected.size === 1 ? [...selected][0] : null,
  );
  activeExcerpt = n.id;
  selected = new Set([n.id]);
  changed();
  centerNode(n.id);
  renderHighlights();
  selection.removeAllRanges();
  const popup = $("#selection-popup");
  popup.classList.remove("hidden");
  excerptPopupAnchor = { x: e.clientX, y: e.clientY };
  excerptTitleCheckpointed = false;
  $("#excerpt-title").value = n.title;
  $("#selection-question").value = "";
  renderShortcuts();
  setExcerptMode("quote");
}
function positionExcerptPopup() {
  const popup = $("#selection-popup");
  if (!excerptPopupAnchor || popup.classList.contains("hidden")) return;
  popup.style.left = Math.max(12, Math.min(innerWidth - popup.offsetWidth - 12, excerptPopupAnchor.x - 100)) + "px";
  const below = excerptPopupAnchor.y + 12;
  popup.style.top = Math.max(12, Math.min(innerHeight - popup.offsetHeight - 12,
    below + popup.offsetHeight <= innerHeight - 12 ? below : excerptPopupAnchor.y - popup.offsetHeight - 12)) + "px";
}
function setExcerptMode(mode, focus = false) {
  excerptMode = mode;
  for (const button of $$("[data-excerpt-mode]")) {
    const active = button.dataset.excerptMode === mode;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  }
  $("#excerpt-title-form").classList.toggle("hidden", mode !== "quote");
  $("#selection-ai-panel").classList.toggle("hidden", mode !== "question");
  $("#excerpt-footnote").textContent = mode === "quote"
    ? "只修改节点标题，原文与出处会一起保留"
    : "原文与出处会一起保留";
  if (mode === "quote") $("#excerpt-title").value = getNode(activeExcerpt)?.title || "";
  positionExcerptPopup();
  if (focus) $(mode === "question" ? "#selection-question" : "#excerpt-title").focus();
}
function locateHighlight(e, side) {
  const sheet = e.target.closest(".source-page,.translation-page");
  if (!sheet) return;
  const page = Number(sheet.dataset.page) || 1;
  const r = sheet.getBoundingClientRect(),
    x = (e.clientX - r.left) / r.width,
    y = (e.clientY - r.top) / r.height;
  const n = state.nodes.find((n) => {
    const source = n.source?.segments?.find((s) => s.page === page) || n.source;
    return source?.docId === state.activeDoc && source.page === page && source.side === side &&
      (side !== "zh" || (source.translationPDFId || null) === (currentDoc().translationPDF?.id || null)) &&
      source.rects?.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  });
  if (n) { selectNode(n.id); centerNode(n.id); }
}
function rangeFromOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement.closest(".highlight-layer,.crop-overlay")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const range = document.createRange();
  let node,
    pos = 0,
    started = false;
  while ((node = walker.nextNode())) {
    const next = pos + node.textContent.length;
    if (!started && start <= next) {
      range.setStart(node, Math.max(0, start - pos));
      started = true;
    }
    if (started && end <= next) {
      range.setEnd(node, Math.max(0, end - pos));
      return range;
    }
    pos = next;
  }
  return null;
}
function renderHighlights() {
  for (const [side, host] of [
    ["en", $("#english-paper")],
    ["zh", $("#chinese-paper")],
  ]) {
    for (const sheet of host.querySelectorAll(".source-page,.translation-page")) {
      const page = Number(sheet.dataset.page) || 1;
      const pagePDF = readerStacks.en?.get(page) || (!currentDoc().translationPDF && readerStacks.zh?.get(page));
      const layer = sheet.querySelector(".highlight-layer");
      if (!layer) continue;
      layer.replaceChildren();
      for (const n of state.nodes) {
        const s = n.source?.segments?.find((part) => part.page === page) || n.source;
        if (!s || s.docId !== state.activeDoc || s.page !== page) continue;
        if (side === "zh" && s.side === "zh" &&
            (s.translationPDFId || null) !== (currentDoc().translationPDF?.id || null)) continue;
        if (s.translationPDFId && s.side !== side) continue;
        let rects = s.side === side ? s.rects : [];
        if (s.anchor && s.side === side) {
          const range = rangeFromOffsets(sheet, s.anchor.start, s.anchor.end);
          if (range) rects = rectsForRange(range, sheet);
        } else if (s.section) {
          const el = sheet.querySelector(
            `[data-section="${CSS.escape(s.section)}"]`,
          );
          if (el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            rects = rectsForRange(range, sheet);
          }
        }
        if (s.block && side === "zh" && s.side !== side) {
          const el = sheet.querySelector(`[data-block="${CSS.escape(s.block)}"]`);
          if (el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            rects = rectsForRange(range, sheet);
          }
        }
        if (s.blockIds?.length && s.side !== side) {
          rects = [];
          if (side === "en" && pagePDF) {
            rects = pagePDF.blocks
              .filter((b) => s.blockIds.includes(b.id))
              .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
          } else
            for (const id of s.blockIds) {
              const el = sheet.querySelector(`[data-block="${CSS.escape(id)}"]`);
              if (el) {
                const range = document.createRange();
                range.selectNodeContents(el);
                rects.push(...rectsForRange(range, sheet));
              }
            }
        }
        for (const r of rects || []) {
          const box = document.createElement("div");
          box.className =
            "highlight-rect" + (selected.has(n.id) ? " focused" : "");
          Object.assign(box.style, {
            left: r.x * 100 + "%",
            top: r.y * 100 + "%",
            width: r.w * 100 + "%",
            height: r.h * 100 + "%",
          });
          layer.append(box);
        }
      }
    }
  }
}

function layoutSize(n) {
  const card = n.id && $(`[data-node-id="${CSS.escape(n.id)}"]`);
  if (card && (!n.image || card.querySelector("img")?.naturalHeight)) return { width: card.offsetWidth, height: card.offsetHeight };
  const width = n.width || 262;
  const lines = (text, available) => String(text || "").split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 12 : 7), 0) / available)), 0);
  const chrome = Math.max(37, lines(n.title, Math.max(60, width - 90)) * 18 + 17) + 37 + (n.prompt ? 60 : 0);
  const body = lines(n.text, width - 30) * 23 + 24 + (n.image ? 230 : 0);
  return { width, height: Math.max(chrome + 48, n.height || chrome + (n.fitContent ? body : Math.min(310, body))) };
}
function arrangeMindmap({ record = true } = {}) {
  if (record) checkpoint();
  if (state.canvasLayout !== "mindmap-lr-v1") {
    const vertical = { left: "top", right: "bottom" };
    for (const edge of state.edges) for (const key of ["fromPort", "toPort"])
      if (vertical[edge[key]]) edge[key] = vertical[edge[key]];
  }
  const positions = mindmapLayout(state.nodes, layoutSize);
  for (const n of state.nodes) Object.assign(n, positions.get(n.id));
  state.canvasLayout = "mindmap-lr-v1";
  changed();
}
function placeBranch(id) {
  const node = getNode(id);
  if (!node?.parentId) return;
  const ids = new Set([id, ...descendants(state.nodes, id).map(n => n.id)]);
  const position = nextNodePosition(state.nodes.filter(n => !ids.has(n.id)), node.parentId, layoutSize, layoutSize(node));
  const dx = position.x - node.x, dy = position.y - node.y;
  for (const n of state.nodes) if (ids.has(n.id)) { n.x += dx; n.y += dy; }
}
function makeNode(fields = {}, parentId = null) {
  const parent = getNode(parentId);
  if (parent) parent.collapsed = false;
  const { x, y } = nextNodePosition(state.nodes, parent?.id, layoutSize, layoutSize(fields));
  const n = {
    id: uid(),
    title: "新想法",
    text: "",
    kind: "note",
    parentId: parent?.id || null,
    ...fields,
    x, y,
  };
  state.nodes.push(n);
  return n;
}
let deferredCanvasRender = false;
const inlineEditor = createInlineEditor({
  getNode, checkpoint, save,
  onResize: () => { syncNodeSizes(); renderEdges(); renderSelection(); },
  onEnd: () => {
    if (deferredCanvasRender) { deferredCanvasRender=false; requestAnimationFrame(() => renderCanvas()); }
  },
});
function startInlineEdit(id, key) {
  if (key === "text" && busy.has(id)) { toast("请等待回答完成，或取消生成后再编辑正文"); return; }
  closeDrawer();
  selectNode(id);
  const card=$(`[data-node-id="${CSS.escape(id)}"]`);
  if(card)inlineEditor.start(card,key);
}
function renderCanvas() {
  if (inlineEditor.active) { deferredCanvasRender=true; return; }
  const nodes = visibleNodes(state.nodes);
  $("#nodes").innerHTML = nodes
    .map((n) => {
      const a = appearance(state.nodes, state.edges, n),
        count = descendants(state.nodes, n.id).length;
      return `<article class="node${n.height ? " fixed-height" : ""}${n.fitContent ? " fit-content" : ""}${selected.has(n.id) ? " selected" : ""}${busy.has(n.id) ? " busy" : ""}" data-node-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${n.width || 262}px;${n.height ? `--node-height:${n.height}px;` : ""}--node-color:${a.color}" tabindex="0" aria-label="${esc(n.title)}"><div class="node-header"><span class="node-level">${a.label}</span><span class="node-title">${esc(n.title)}</span><span class="node-kind">${n.kind === "ai" ? "AI" : n.kind === "quote" ? "摘录" : n.kind === "image" ? "图片" : "笔记"}</span></div>${n.prompt ? `<div class="node-question">问：${esc(n.prompt)}</div>` : ""}<div class="node-body">${imagePreview(n)}<div class="node-text${n.text ? "" : " empty"}">${esc(n.text)}</div></div>${busy.has(n.id) ? `<div class="node-ai-progress"><span>${esc(aiProgress.get(n.id) || "正在准备回答…")}</span><button data-cancel-ai="${esc(n.id)}" class="small-button">取消</button></div>` : ""}${n.aiEvidence ? `<div class="node-model" title="本次回答生成时的模型与推理强度">${esc(aiModelLabel(n.aiEvidence))}</div>` : ""}${n.error ? `<div class="node-error">${esc(n.error)} · 打开节点可重试</div>` : ""}<div class="node-footer">${n.source ? `<button class="source-link" data-source="${esc(n.id)}">${icon("file")} p.${n.source.page} · ${esc(n.source.translationPDFName || state.docs.find((d) => d.id === n.source.docId)?.name || "原文")}</button>` : "<span>个人笔记</span>"}<button class="node-followup" data-followup="${esc(n.id)}">${icon("spark")} 追问</button></div>${[["top", "上方", "拖动建立关联"], ["right", "右侧", "拖向子节点"], ["bottom", "下方", "拖动建立关联"], ["left", "左侧", "拖向父节点"]].map(([side, name, hint]) => `<button class="port port-${side}" data-port="${side}" title="${hint}" aria-label="${name}连接点：${esc(n.title)} · ${hint}"></button>`).join("")}${nodeResizeHandles(n)}${count ? `<button class="node-collapse" data-collapse="${esc(n.id)}" title="${n.collapsed ? "展开" : "折叠"}后续节点">${n.collapsed ? "+" : "−"} ${count}</button>` : ""}</article>`;
    })
    .join("");
  $("#node-count").textContent = state.nodes.length;
  $("#canvas-empty").classList.toggle("hidden", state.nodes.length > 0);
  renderSelection();
  applyView();
  syncNodeSizes();
  for (const image of $$("#nodes .node-image")) image.onload = () => renderEdges();
  requestAnimationFrame(renderEdges);
}
function nodeResizeHandles(n) {
  return [["e", "调整宽度"], ["s", "调整高度"], ["se", "调整节点大小"]].map(([direction, label]) =>
    `<button class="node-resize node-resize-${direction}" data-resize="${direction}" aria-label="${label}：${esc(n.title)}" title="${label}；双击适应内容；方向键微调"></button>`).join("");
}
function applyNodeSize(card, node) {
  card.style.width = (node.width || 262) + "px";
  card.classList.toggle("fixed-height", !!node.height);
  card.classList.toggle("fit-content", !!node.fitContent);
  if (node.height) card.style.setProperty("--node-height", node.height + "px");
  else card.style.removeProperty("--node-height");
  const chrome = [".node-header", ".node-question", ".node-error", ".node-ai-progress", ".node-model", ".node-footer"]
    .reduce((sum, selector) => sum + (card.querySelector(selector)?.offsetHeight || 0), 2);
  // Even at the smallest manual height, retain the full title and footer.
  card.style.minHeight = Math.max(118, node.height ? chrome + 48 : 118) + "px";
}
function syncNodeSizes() {
  for (const card of $$("#nodes .node")) applyNodeSize(card, getNode(card.dataset.nodeId));
  syncSizingControls();
}
function syncSizingControls() {
  const node = getNode(editorId);
  if (!node || !$("#node-width")) return;
  $("#node-width").value = node.width || 262;
  $("#node-width-value").textContent = node.width || 262;
  $("#node-height").value = nodeHeight(node.id);
  $("#node-height-value").textContent = node.height ? nodeHeight(node.id) + " px" : "自动";
}
function fitNodeToContent(id) {
  const node = getNode(id), card = $(`[data-node-id="${CSS.escape(id)}"]`);
  if (!node || !card) return;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "600 12px sans-serif";
  const titleWidth = Math.sqrt(measure.measureText(node.title).width * 18 * 2) + 80;
  const bodyWidth = node.text.length > 400 ? 460 : node.text.length > 150 ? 360 : 262;
  const image = card.querySelector(".node-image");
  const imageWidth = image?.naturalHeight ? image.naturalWidth / image.naturalHeight * 260 + 28 : 0;
  checkpoint();
  node.width = Math.round(Math.max(220, Math.min(640, Math.max(titleWidth, bodyWidth, imageWidth))));
  delete node.height;
  node.fitContent = true;
  changed();
}
function cancelNodeResize() {
  if (drag?.type !== "resize") return;
  const pending = drag, node = getNode(pending.id);
  drag = null;
  if (node) for (const key of ["width", "height", "fitContent"]) {
    if (pending.before[key] === undefined) delete node[key];
    else node[key] = pending.before[key];
  }
  if (pending.moved && undoStack.at(-1) === pending.undoEntry) {
    undoStack = pending.undoBefore;
    redoStack = pending.redoBefore;
  }
  changed();
}
function renderSelection() {
  // Keep the clicked elements alive between clicks so native double-clicks work.
  for (const card of $$("#nodes .node"))
    card.classList.toggle("selected", selected.has(card.dataset.nodeId));
  $("#selection-actions").classList.toggle("hidden", !selected.size);
  $("#selection-count").textContent = `${selected.size} 个节点`;
  $("#undo").disabled = !undoStack.length;
  $("#redo").disabled = !redoStack.length;
}
function nodeWidth(id) {
  return getNode(id)?.width || 262;
}
function nodeHeight(id) {
  return $(`[data-node-id="${CSS.escape(id)}"]`)?.offsetHeight || 160;
}
function nodeBox(id) {
  const n = getNode(id);
  return { x: n.x, y: n.y, width: nodeWidth(id), height: nodeHeight(id) };
}
function edgeMarkup(from, to, type, label, attributes, ports = {}) {
  const curve = connectionCurve(nodeBox(from), nodeBox(to), { type, ...ports });
  const key = type === "parent" ? "parent:" + to : "relation:" + ports.id;
  const handles = ["from", "to"].map((endpoint) => {
    const p = endpointGrip(curve, endpoint, 20 / state.view.scale);
    return `<circle class="edge-endpoint" data-endpoint="${endpoint}" cx="${p.x}" cy="${p.y}" r="${6 / state.view.scale}" tabindex="0" role="button" aria-label="拖开断开：${esc(label)} · ${esc(getNode(endpoint === "from" ? from : to).title)}"><title>拖到空白处松手，删除这条连接</title></circle>`;
  }).join("");
  return `<g class="edge-group${selectedEdgeKey === key ? " selected" : ""}" data-edge-key="${esc(key)}" data-from="${esc(from)}" data-to="${esc(to)}" ${attributes}><path class="edge-hit" d="${curve.path}"/><path class="edge-path${type === "relation" ? " relation" : ""}" d="${curve.path}" marker-end="url(#arrow)"/>${handles}<text class="edge-label" ${attributes} x="${curve.label.x}" y="${curve.label.y - 7}" text-anchor="middle" tabindex="0" role="button" aria-label="调整关系：${esc(label)}">${esc(label)}<title>点击调整关系</title></text></g>`;
}
function edgeReference(group) {
  return { type: group.dataset.parentEdge ? "parent" : "relation", from: group.dataset.from, to: group.dataset.to, id: group.dataset.edge };
}
function connectionsAtPort(id, port) {
  return $$(".edge-group").flatMap((group) => {
    const ref = edgeReference(group), edge = ref.type === "relation" ? state.edges.find((e) => e.id === ref.id) : null;
    const curve = connectionCurve(nodeBox(ref.from), nodeBox(ref.to), { ...edge, type: ref.type });
    const point = portPoint(nodeBox(id), port);
    const endpoint = ref.from === id ? "from" : ref.to === id ? "to" : null;
    const connected = endpoint === "from" ? curve.start : curve.end;
    return endpoint && Math.hypot(point.x - connected.x, point.y - connected.y) < 1 ? [{ reference: ref, endpoint, curve, group }] : [];
  });
}
function renderEdges() {
  const visible = new Set(visibleNodes(state.nodes).map((n) => n.id));
  let html = "";
  for (const n of state.nodes) {
    const p = getNode(n.parentId);
    if (p && visible.has(n.id) && visible.has(p.id)) {
      html += edgeMarkup(p.id, n.id, "parent", n.parentLabel || "父子", `data-parent-edge="${esc(n.id)}"`);
    }
  }
  for (const e of state.edges) {
    const a = getNode(e.from),
      b = getNode(e.to);
    if (!a || !b || !visible.has(a.id) || !visible.has(b.id)) continue;
    html += edgeMarkup(a.id, b.id, "relation", e.label || "关联", `data-edge="${esc(e.id)}"`, e);
  }
  $("#edge-paths").innerHTML = html;
}
function applyView() {
  const v = state.view;
  $("#canvas-world").style.transform =
    `translate(${v.x}px,${v.y}px) scale(${v.scale})`;
  $("#canvas-zoom").textContent = Math.round(v.scale * 100) + "%";
  $("#canvas").style.backgroundPosition = `${v.x}px ${v.y}px`;
  $("#canvas").style.backgroundSize =
    19 * v.scale + "px " + 19 * v.scale + "px";
}
function selectNode(id, add = false) {
  clearEdgeSelection();
  if (!add) selected = new Set([id]);
  else if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  renderSelection();
  renderHighlights();
}
function centerNode(id) {
  const n = getNode(id);
  if (!n) return;
  for (const a of ancestors(state.nodes, id)) a.collapsed = false;
  const b = $("#canvas").getBoundingClientRect();
  state.view.x = b.width / 2 - (n.x + nodeWidth(n.id) / 2) * state.view.scale;
  state.view.y = b.height / 2 - (n.y + nodeHeight(id) / 2) * state.view.scale;
  renderCanvas();
  save();
}
function fitCanvas() {
  const nodes = visibleNodes(state.nodes);
  if (!nodes.length) return;
  const b = $("#canvas").getBoundingClientRect();
  const minX = Math.min(...nodes.map((n) => n.x)),
    maxX = Math.max(...nodes.map((n) => n.x + nodeWidth(n.id))),
    minY = Math.min(...nodes.map((n) => n.y)),
    maxY = Math.max(...nodes.map((n) => n.y + nodeHeight(n.id)));
  const scale = Math.max(
    0.15,
    Math.min(
      1.1,
      (b.width - 65) / (maxX - minX),
      (b.height - 165) / (maxY - minY),
    ),
  );
  state.view = {
    scale,
    x: (b.width - (maxX - minX) * scale) / 2 - minX * scale,
    y: 80 - minY * scale,
  };
  applyView();
  save();
}
function zoom(delta, x, y) {
  const b = $("#canvas").getBoundingClientRect();
  x ??= b.width / 2;
  y ??= b.height / 2;
  const v = state.view,
    s = Math.max(0.15, Math.min(2.5, v.scale * delta));
  v.x = x - ((x - v.x) * s) / v.scale;
  v.y = y - ((y - v.y) * s) / v.scale;
  v.scale = s;
  applyView();
  save();
}
async function revealSource(id) {
  const n = getNode(id);
  if (!n?.source) return;
  const sameDoc = state.activeDoc === n.source.docId;
  state.activeDoc = n.source.docId;
  state.page = n.source.page;
  selected = new Set([id]);
  if (!sameDoc || !readerStacks.en) await renderReader();
  if (readerStacks.en) await turnPage(n.source.page);
  if (n.source.side === "zh" &&
      (n.source.translationPDFId || null) !== (currentDoc().translationPDF?.id || null)) {
    renderCanvas();
    save();
    return toast("已打开对应原文页；该摘录所用的译本已解除配对或被替换，引用文字仍保留在节点中");
  }
  const side = n.source.side === "zh" ? "chinese" : "english";
  const sheet = $(
    readerStacks.en
      ? `#${side}-paper .pdf-sheet[data-page="${n.source.page}"]`
      : `#${side}-paper .source-page,#${side}-paper .translation-page`,
  );
  let target = n.source.section
    ? sheet?.querySelector(`[data-section="${CSS.escape(n.source.section)}"]`)
    : null;
  if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  else if (sheet && n.source.rects?.length)
    $(`#${side}-scroll`).scrollTop +=
      sheet.getBoundingClientRect().top - $(`#${side}-scroll`).getBoundingClientRect().top +
      n.source.rects[0].y * sheet.offsetHeight - 150;
  renderCanvas();
  renderHighlights();
  save();
}
function aiModelLabel(e) {
  if (!e) return "";
  const effort = e.reasoningEffort || (e.provider === "codex" ? "medium" : null);
  return `${e.model || "模型未记录"} · ${effort === "medium" ? "中等推理 (medium)" : effort ? effort + " 推理" : "推理强度未记录"}`;
}
function renderAIEvidence(n) {
  const e=n.aiEvidence;
  if(!e)return "";
  const labels=pages=>[...new Set(pages.map(p=>`${p.name} · ${p.side === "zh" ? "中文" : "原文"}第 ${p.page} 页`))].join("\n");
  return `<details><summary>本次参考文献 · ${e.provider === "codex" ? "Codex" : "模型 API"}</summary><p>${esc(aiModelLabel(e))}</p>${(e.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join("")}<p>随问题附带的页面</p><div class="source-box">${esc(labels(e.attached||[]) || "未附带文献页面")}</div>${e.sources?.length ? `<p>全文检索或阅读返回的页面</p><div class="source-box">${esc(labels(e.sources))}</div>` : ""}${e.trace?.length ? `<details><summary>全文检索与阅读记录</summary><div class="source-box">${esc(JSON.stringify(e.trace,null,2))}</div></details>` : ""}</details>`;
}
async function askConfiguredAI(messages, config, signal) {
  return (config.readingProvider || "codex") === "codex" ? (await askCodex(messages,config,signal)).content : askAI(messages,config,signal);
}
function editNode(id, focusQuestion = false, focusField = null) {
  const n = getNode(id);
  if (!n) return;
  editorId = id;
  const parentOptions = state.nodes.filter(
    (p) =>
      p.id !== id && !descendants(state.nodes, id).some((d) => d.id === p.id),
  );
  openDrawer(
    "节点笔记",
    `${imagePreview(n)}<label class="field-label" for="node-width">节点宽度 <span id="node-width-value">${n.width || 262}</span> px</label><input id="node-width" type="range" min="180" max="800" value="${n.width || 262}" style="width:100%"><label class="field-label" for="node-height">节点高度 <span id="node-height-value">${n.height ? nodeHeight(id) + " px" : "自动"}</span></label><input id="node-height" type="range" min="118" max="2000" value="${Math.min(2000, nodeHeight(id))}" style="width:100%"><button id="fit-node-content" class="small-button">适应内容</button><label class="field-label" for="edit-title">标题</label><input class="text-field" id="edit-title" value="${esc(n.title)}"><label class="field-label" for="edit-text">${n.kind === "ai" ? "AI 回答 · 可编辑" : "笔记内容"}</label><textarea class="text-area" id="edit-text">${esc(n.text)}</textarea><label class="field-label" for="edit-parent">归属节点 · 调整后自动更新层级</label><select class="select-field" id="edit-parent"><option value="">独立 / 顶层节点</option>${parentOptions.map((p) => `<option value="${esc(p.id)}" ${p.id === n.parentId ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>${n.prompt ? `<details open><summary>原始问题</summary><div class="source-box">${esc(n.prompt)}</div></details>` : ""}${n.source ? `<details><summary>引用内容 · 第 ${n.source.page} 页</summary><p>${esc(sourceCitation(state, n.source))}</p><div class="source-box">${esc(n.source.text || "图片摘录")}${n.source.translation ? "\n\n中文：" + esc(n.source.translation) : ""}</div><button class="small-button" id="editor-source">定位原文与译文</button></details>` : ""}${n.research?.length ? `<details><summary>学术检索来源 · Crossref 元数据</summary><div class="source-box">${n.research.map((r) => `<p><a target="_blank" rel="noopener noreferrer" href="https://doi.org/${encodeURIComponent(r.doi || "")}">${esc(r.title || r.doi)}</a><br>${esc(r.authors || "")} · ${esc(r.year || "")}</p>`).join("")}</div></details>` : ""}${renderAIEvidence(n)}${n.context ? `<details><summary>当时发送给 AI 的上下文</summary><div class="source-box">${esc(n.context)}</div></details>` : ""}${n.history?.length ? `<details><summary>历史回答 · ${n.history.length} 条</summary><div class="source-box">${esc(n.history.map((h) => "问：" + h.prompt + "\n答：" + h.text).join("\n\n"))}</div></details>` : ""}${n.error ? `<p class="node-error">${esc(n.error)}</p><button id="retry-ai" class="button">重试这个问题</button>` : ""}<div style="display:flex;gap:8px;margin-top:20px"><button class="button" id="new-child">＋ 子笔记</button><button class="button" id="detach-node">转为独立节点</button></div>`,
    `<p>继续追问，回答会保存在此节点右侧</p><form id="followup-form" class="ask-input"><input id="followup-question" placeholder="沿着这个想法，继续问…" aria-label="节点追问"><div class="model-picker"><button type="button" class="model-picker-trigger" aria-label="选择追问模型" aria-haspopup="menu" aria-expanded="false" aria-controls="followup-model-menu"><span>默认模型</span>${icon("chevronDown")}</button><div id="followup-model-menu" class="model-picker-menu" role="menu" aria-label="选择模型" hidden></div></div><button class="send-button" type="submit" aria-label="发送追问">${icon("arrowUp")}</button></form>${busy.has(id) ? '<button id="cancel-ai" class="small-button">取消生成</button>' : ""}`,
  );
  for (const key of ["width", "height"]) {
    let checkpointed = false;
    const input = $("#node-" + key);
    input.onpointerdown = input.onfocus = () => { checkpointed = false; };
    input.oninput = (e) => {
      const node = getNode(id), value = Number(e.target.value);
      if (!node || node[key] === value) return;
      if (!checkpointed) { checkpoint(); checkpointed = true; }
      node[key] = value;
      if (key === "height") delete node.fitContent;
      changed();
    };
    input.onchange = () => { checkpointed = false; };
  }
  $("#fit-node-content").onclick = () => fitNodeToContent(id);
  for (const [field, key] of [
    ["#edit-title", "title"],
    ["#edit-text", "text"],
  ]) {
    const input = $(field);
    let checkpointed = false;
    input.onfocus = () => { checkpointed = false; };
    input.oninput = input.onchange = () => {
      const node = getNode(id);
      if (!node || node[key] === input.value) return;
      if (!checkpointed) {
        checkpoint();
        checkpointed = true;
      }
      node[key] = input.value;
      if (key === "title") node.titleEdited = true;
      changed();
    };
  }
  $("#edit-parent").onchange = () => {
    try {
      checkpoint();
      setParent(state.nodes, id, $("#edit-parent").value);
      placeBranch(id);
      changed();
    } catch (e) {
      toast(e.message);
    }
  };
  $("#editor-source")?.addEventListener("click", () => {
    closeDrawer();
    revealSource(id);
  });
  $("#new-child").onclick = () => {
    checkpoint();
    const child = makeNode({}, id);
    selected = new Set([child.id]);
    changed();
    editNode(child.id);
    centerNode(child.id);
  };
  $("#detach-node").onclick = () => {
    checkpoint();
    n.parentId = null;
    state.edges = state.edges.filter((e) => e.from !== id && e.to !== id);
    for (const c of state.nodes.filter((c) => c.parentId === id))
      c.parentId = null;
    changed();
    editNode(id);
  };
  disposeModelPicker=mountModelPicker($("#followup-form .model-picker"),{
    getConfig:()=>state.config,
    onSelect:model=>{state.config={...state.config,readingProvider:"codex",codexModel:model};save();checkStatus();},
    onSettings:settings,
  });
  $("#followup-form").onsubmit = (e) => {
    e.preventDefault();
    const q = $("#followup-question").value.trim();
    if (q) runNodeAI(id, q, true);
  };
  $("#retry-ai")?.addEventListener("click", () =>
    runNodeAI(id, n.prompt || "请解释这段内容", false),
  );
  $("#cancel-ai")?.addEventListener("click", () => busy.get(id)?.abort());
  if (focusQuestion) $("#followup-question").focus();
  else if (focusField) {
    const field = focusField === "title" ? $("#edit-title") : $("#edit-text");
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
}
async function externalResearch(question, signal) {
  let term = question;
  try {
    const raw = await askAI(
      [
        {
          role: "system",
          content:
            "Extract 3–8 English academic search keywords from the user question. Return only keywords. Do not answer the question.",
        },
        { role: "user", content: question },
      ],
      state.config,
      signal,
    );
    term = raw.slice(0, 250);
  } catch {}
  const res = await fetch(
    "https://api.crossref.org/works?rows=5&query.bibliographic=" +
      encodeURIComponent(term),
    { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
  );
  if (!res.ok) throw new Error("学术检索暂时不可用");
  const data = await res.json();
  return data.message.items.map((w) => ({
    title: w.title?.[0],
    authors: w.author
      ?.slice(0, 3)
      .map((a) => [a.given, a.family].filter(Boolean).join(" "))
      .join(", "),
    year: w.issued?.["date-parts"]?.[0]?.[0],
    doi: w.DOI,
    url: w.URL,
  }));
}
async function runNodeAI(id, prompt, child = false) {
  const workspace = state;
  const requestConfig = {...state.config};
  const original = getNode(id);
  if (!original) return;
  if (busy.has(id)) {
    toast("这个节点正在生成，请稍等或取消");
    return;
  }
  checkpoint();
  let n = original;
  if (child) {
    n = makeNode(
      {
        kind: "ai",
        title: prompt,
        text: "",
        source: original.source ? structuredClone(original.source) : undefined,
      },
      id,
    );
    selected = new Set([n.id]);
  }
  if (n.kind === "ai" && n.text)
    (n.history ||= []).push({
      prompt: n.prompt,
      text: n.text,
      at: new Date().toISOString(),
    });
  n.prompt = prompt;
  n.error = null;
  const controller = new AbortController();
  busy.set(n.id, controller);
  $("#selection-popup").classList.add("hidden");
  changed();
  if (child) {
    centerNode(n.id);
    editNode(n.id);
  }
  const chain = ancestors(state.nodes, n.id);
  const evidence = chain;
  let context =
    !child && n.contextNodeIds && n.context
      ? n.context
      : contextText(state, evidence, {
          sources: true,
          history: true,
          translation: true,
        });
  if (context.length > 100000) {
    n.error =
      "上下文超过 10 万字符，请减少分支内容或使用“作为 AI 上下文”选择范围。";
    busy.delete(n.id);
    changed();
    return;
  }
  let research = null, literature, codexResult;
  const useCodex = (requestConfig.readingProvider || "codex") === "codex";
  const progress = message => {
    if (state !== workspace || !getNode(n.id)) return;
    aiProgress.set(n.id, message);
    const el = $(`[data-node-id="${CSS.escape(n.id)}"] .node-ai-progress span`);
    if (el) el.textContent = message;
  };
  try {
    literature = await collectLiterature(state, chain, {signal:controller.signal,onProgress:progress});
    context += literature.context;
    if (
      /相关研究|衍生.*研究|相关论文|文献检索|related research/i.test(prompt)
    ) {
      try {
        research = await externalResearch(
          (n.source?.text || n.title) + "\n" + prompt,
          controller.signal,
        );
        context +=
          "\n\nCrossref 检索到的文献元数据（仅元数据，不代表已阅读全文）：\n" +
          JSON.stringify(research);
      } catch (e) {
        if (controller.signal.aborted) throw e;
        context +=
          "\n外部学术检索未成功。本次不得声称已找到或验证相关论文，请说明检索不可用。";
      }
    }
    const messages = [
      { role: "system", content: readingSystem + await readingPreferences(state.projectId) },
      { role: "user", content: "阅读上下文：\n" + context },
    ];
    const images = chain.filter((x) => x.image);
    const content = [
      { type: "text", text: "用户问题：" + prompt },
      ...images.map((x) => ({
        type: "image_url",
        image_url: { url: x.image },
      })),
    ];
    messages.push({
      role: "user",
      content: images.length ? content : "用户问题：" + prompt,
    });
    const answer = useCodex
      ? (codexResult = await askCodex(messages, requestConfig, controller.signal, {literature,onEvent:event=>{
          if(event.type === "status") progress(event.message);
          else if(event.type === "delta") progress("Codex 正在生成回答…");
        }})).content
      : await askAI(messages, requestConfig, controller.signal);
    if (state !== workspace) return;
    const target = getNode(n.id);
    if (!target) return;
    target.kind = "ai";
    target.text = answer;
    if (!target.titleEdited) target.title = prompt === "总结概括" ? "摘录概括" : prompt;
    target.context = context;
    target.aiEvidence = {provider:useCodex ? "codex" : "api",model:codexResult?.model || requestConfig.model || "",reasoningEffort:codexResult?.reasoningEffort,attached:literature.attached,sources:codexResult?.sources || [],trace:codexResult?.trace || [],warnings:literature.warnings};
    target.research = research;
    target.generatedAt = new Date().toISOString();
    target.error = null;
    if (prompt !== "总结概括") learnQuestion(prompt).catch(() => {});
  } catch (e) {
    if (state !== workspace) return;
    const target = getNode(n.id);
    if (target) {
      target.error = e.message;
      target.prompt = prompt;
    }
    toast(e.message);
  } finally {
    busy.delete(n.id);
    aiProgress.delete(n.id);
    if (state === workspace) {
      changed();
      if (editorId === n.id) editNode(n.id);
    }
  }
}
async function learnQuestion(prompt) {
  const workspace = state;
  const raw = await askConfiguredAI(
    [
      {
        role: "system",
        content:
          '将用户提问归纳为可重复使用的操作。只返回 JSON {"existingId":"已有类别id或空串","label":"10字以内操作名","template":"不含具体主题、面向选中内容的通用指令"}。只有语义和操作目的相同才匹配已有类别。',
      },
      {
        role: "user",
        content: JSON.stringify({
          question: prompt,
          groups: state.questionGroups.map((g) => ({
            id: g.id,
            label: g.label,
            template: g.template,
          })),
        }),
      },
    ],
    state.config,
  );
  if (workspace !== state) return;
  const result = parseJSON(raw);
  if (typeof result.label !== "string" || typeof result.template !== "string")
    return;
  let group = state.questionGroups.find((g) => g.id === result.existingId);
  if (!group) {
    group = {
      id: uid(),
      label: result.label.slice(0, 20),
      template: result.template.slice(0, 1500),
      count: 0,
    };
    state.questionGroups.push(group);
  }
  group.count++;
  if (group.count > 3 && !group.offered) {
    group.offered = true;
    offerShortcut(group);
  }
  save();
}
function offerShortcut(g) {
  const box = document.createElement("div");
  box.className = "shortcut-offer";
  box.innerHTML = `你已问过 ${g.count} 次类似问题<p>保存「${esc(g.label)}」为快捷操作？</p><button data-accept>编辑并添加</button><button data-dismiss>暂不添加</button>`;
  document.body.append(box);
  $("[data-dismiss]", box).onclick = () => box.remove();
  $("[data-accept]", box).onclick = () => {
    box.remove();
    modal(
      "添加快捷操作",
      `<label class="field-label">名称</label><input id="shortcut-label" class="text-field" value="${esc(g.label)}"><label class="field-label">通用指令</label><textarea id="shortcut-template" class="text-area">${esc(g.template)}</textarea>`,
      '<button id="confirm-shortcut" class="button primary">添加</button>',
    );
    $("#confirm-shortcut").onclick = () => {
      const label = $("#shortcut-label").value.trim(),
        template = $("#shortcut-template").value.trim();
      if (!label || !template) return;
      state.shortcuts.push({ id: uid(), label, template });
      save();
      $("#modal").close();
      toast("快捷操作已添加");
    };
  };
}
function renderShortcuts() {
  $("#learned-shortcuts").innerHTML = state.shortcuts
    .map(
      (s) =>
        `<button class="chip" data-shortcut="${s.id}">${esc(s.label)}</button>`,
    )
    .join("");
  $$("[data-shortcut]").forEach(
    (el) =>
      (el.onclick = () => {
        const s = state.shortcuts.find((s) => s.id === el.dataset.shortcut);
        if (s && activeExcerpt) runNodeAI(activeExcerpt, s.template);
      }),
  );
  positionExcerptPopup();
}
function openTranslationImport() {
  const doc = currentDoc(), workspace = state;
  if (doc.type !== "pdf") return toast("请先在左侧打开需要对照的英文 PDF");
  const existing = state.docs.filter((d) => d.type === "pdf" && d.id !== doc.id);
  modal("导入中文译本",
    `<p>当前原文：<strong>${esc(doc.name)}</strong> · ${doc.pages} 页</p>
    <p>中文译本会显示在中间栏，与原文按页同步。请选择页数相同的中文 PDF；划词摘录会保留译本名称、页码和选区。</p>
    ${doc.translationPDF ? `<p>已配对：${esc(doc.translationPDF.name)}</p><label><input type="checkbox" id="translation-same-layout"> 更新同版式修订，保留已有摘录定位</label><p class="muted">仅当页码与正文位置保持不变时勾选，例如补译图内文字。</p>` : ""}
    <button class="button primary" id="choose-translation-file">选择本机中文 PDF</button>
    ${existing.length ? `<hr><p>已经导入文献库？直接选择配对：</p>${existing.map((d) => `<button class="doc-entry" data-pair-doc="${esc(d.id)}">${icon("file")}<span>${esc(d.name)}<small>${d.pages} 页${d.pages !== doc.pages ? " · 页数与原文不同" : ""}</small></span></button>`).join("")}` : ""}
    <p id="translation-import-message" role="status" aria-live="polite"></p>`,
    doc.translationPDF ? '<button class="button" id="download-translation">下载中文 PDF</button><button class="button" id="unpair-translation">解除配对</button>' : "");
  if($("#download-translation"))$("#download-translation").onclick=()=>download(doc.translationPDF.name+'.pdf',Uint8Array.from(atob(doc.translationPDF.data),c=>c.charCodeAt(0)),'application/pdf');
  $("#choose-translation-file").onclick = () => {
    translationTarget = { doc, workspace, sameLayout: !!$("#translation-same-layout")?.checked };
    $("#translation-file-input").value = "";
    $("#translation-file-input").click();
  };
  $$("[data-pair-doc]").forEach((el) => {
    el.onclick = () => attachTranslation({ doc, workspace }, state.docs.find((d) => d.id === el.dataset.pairDoc));
  });
  if ($("#unpair-translation")) $("#unpair-translation").onclick = async () => {
    if (importingTranslation || state !== workspace) return;
    delete doc.translationPDF;
    $("#modal").close();
    save();
    if (currentDoc() === doc) await renderReader();
    toast("已解除配对，画布中的摘录仍然保留");
  };
}
async function attachTranslation(target, candidate) {
  if (!target || !candidate || importingTranslation) return;
  importingTranslation = true;
  const message = $("#translation-import-message");
  if (message) message.textContent = "正在检查中文译本…";
  try {
    const { doc, workspace, sameLayout } = target;
    let translated = candidate;
    if (candidate instanceof File) {
      if (!/\.pdf$/i.test(candidate.name) && candidate.type !== "application/pdf")
        throw new Error("中文译本请选择 PDF 文件");
      if (candidate.size > 60 * 1024 * 1024) throw new Error("中文 PDF 请控制在 60 MB 以内");
      translated = {
        id: uid(), type: "pdf", name: candidate.name.replace(/\.pdf$/i, ""),
        data: arrayBase64(new Uint8Array(await candidate.arrayBuffer())),
      };
    }
    // Parse before replacing an existing attachment; malformed PDFs leave it intact.
    const pdf = await loadPDF(translated);
    const paired = pairedTranslation(doc, { ...translated, pages: pdf.numPages },
      doc.translationPDF && (sameLayout || doc.translationPDF.data === translated.data) ? doc.translationPDF.id : uid());
    if (state !== workspace || !state.docs.includes(doc)) return;
    translationAbort?.abort();
    doc.translationPDF = paired;
    $("#modal").close();
    save();
    if (currentDoc() === doc) await renderReader();
    toast("中文译本已放入中间栏，与原文按页对照");
  } catch (e) {
    if (message?.isConnected) message.textContent = e.message;
    toast(e.message);
  } finally {
    importingTranslation = false;
    $("#translation-file-input").value = "";
  }
}
function openLibrary() {
  editorId = null;
  openDrawer(
    "文献库",
    `<p style="font-size:11px;color:#91a084;line-height:1.8">不同文献的摘录，可以放在同一张画布。</p>${state.docs.map((d) => `<button class="doc-entry ${d.id === state.activeDoc ? "active" : ""}" data-doc="${d.id}">${icon("file")}<span>${esc(d.name)}<small>${d.type === "demo" ? "功能演示" : d.type.toUpperCase()} · ${d.pages} 页</small></span></button>`).join("")}<button id="library-import" class="button" style="width:100%;margin-top:12px">＋ 导入 PDF / 文本 / 项目</button>`,
  );
  $$("[data-doc]").forEach(
    (el) =>
      (el.onclick = async () => {
        state.activeDoc = el.dataset.doc;
        state.page = 1;
        $("#english-scroll").scrollTop = 0;
        $("#chinese-scroll").scrollTop = 0;
        await renderReader();
        save();
        closeDrawer();
      }),
  );
  $("#library-import").onclick = () => $("#file-input").click();
}
function openOutline() {
  editorId = null;
  const ordered = [],
    stack = state.nodes
      .filter((n) => !n.parentId)
      .reverse()
      .map((n) => [n, 0]);
  while (stack.length) {
    const [n, d] = stack.pop();
    ordered.push([n, d]);
    for (const child of state.nodes
      .filter((x) => x.parentId === n.id)
      .reverse())
      stack.push([child, d + 1]);
  }
  openDrawer(
    "节点大纲",
    `<p style="font-size:11px;color:#91a084">${state.nodes.length} 个节点 · 层级不设上限</p>${ordered
      .map(([n, d]) => {
        const a = appearance(state.nodes, state.edges, n);
        return `<button class="outline-entry" data-outline="${n.id}" style="margin-left:${Math.min(120, d * 15)}px;width:calc(100% - ${Math.min(120, d * 15)}px);--node-color:${a.color}"><span class="outline-level">${a.label}</span>${esc(n.title)}</button>`;
      })
      .join("")}`,
  );
  $$("[data-outline]").forEach(
    (el) =>
      (el.onclick = () => {
        selectNode(el.dataset.outline);
        centerNode(el.dataset.outline);
        closeDrawer();
      }),
  );
}
async function switchProject(next) {
  if(busy.size || translationAbort)throw new Error("请先等待生成或翻译完成，或取消后再切换项目");
  inlineEditor.finish();clearTimeout(saveTimer);
  validateDetails(validateProject(next));
  next.config={...state.config};next.shortcuts ||= [];next.questionGroups ||= [];
  await activateSavedProject(state,next);
  state=next;selected.clear();undoStack=[];redoStack=[];activeExcerpt=null;
  $("#modal").close();closeDrawer();$("#selection-popup").classList.add("hidden");
  $("#project-name").textContent=state.title;
  changed();if(state.canvasLayout!=="mindmap-lr-v1")arrangeMindmap();
  await renderReader();checkStatus();
  toast("已打开项目，其他项目完整保留，可从「项目」切换");
}
async function openProjects() {
  inlineEditor.finish();
  try {
    clearTimeout(saveTimer);await writeSaved(state);
    const projects=await listSavedProjects();
    modal("我的阅读项目",`<p>每个项目分别保存文献、译本、导图、图片和对话。切换前自动保存当前内容。</p><div class="project-list">${projects.map(p=>`<div class="project-entry"><strong>${esc(p.title)}${p.id===state.projectId?' <small>当前</small>':''}</strong><p>${p.docs} 份文献 · ${p.nodes} 个节点</p><p>${esc(p.documentNames.join(' / '))}</p><div><button class="button" data-open-project="${esc(p.id)}" ${p.id===state.projectId?'disabled':''}>${p.id===state.projectId?'已打开':'打开项目'}</button><button class="small-button" data-backup-project="${esc(p.id)}">下载完整备份</button></div></div>`).join('')}</div>`, '<button class="button" id="import-project">导入项目备份</button><button class="button primary" id="new-project">新建阅读项目</button>');
    for(const button of $$("[data-open-project]"))button.onclick=async()=>{
      button.disabled=true;
      try{const saved=await readSavedProject(button.dataset.openProject);if(!saved)throw new Error("未找到项目，请使用备份恢复");await switchProject(saved);}catch(e){button.disabled=false;toast(e.message);}
    };
    for(const button of $$("[data-backup-project]"))button.onclick=async()=>{
      const saved=await readSavedProject(button.dataset.backupProject);if(saved){const copy=structuredClone(saved);delete copy.config;delete copy._cloudRevision;download(copy.title+".folio.json",JSON.stringify(copy,null,2));}
    };
    $("#import-project").onclick=()=>{$("#modal").close();$("#file-input").click();};
    $("#new-project").onclick=()=>{
      modal("新建阅读项目",'<label class="field-label" for="new-project-title">项目名称</label><input id="new-project-title" class="text-field" value="新的阅读项目">','<button class="button primary" id="create-project">保存当前并新建</button>');
      $("#create-project").onclick=async()=>{
        const title=$("#new-project-title").value.trim();if(!title)return;
        const next=createDemo();next.title=title;next.nodes=[];next.edges=[];next.canvasLayout="mindmap-lr-v1";next.view={x:25,y:25,scale:.76};
        try{await switchProject(next);}catch(e){toast(e.message);}
      };
    };
  }catch(e){toast("项目保存失败："+e.message);}
}
async function importFiles(files) {
  for (const file of files) {
    try {
      if (file.size > (/\.json$/i.test(file.name) ? 300 : 60) * 1024 * 1024)
        throw new Error(
          "PDF 请控制在 60 MB 以内，项目备份请控制在 300 MB 以内",
        );
      if (/\.json$/i.test(file.name)) {
        const imported = validateDetails(
          validateProject(JSON.parse(await file.text())),
        );
        modal(
          "导入为新项目",
          `<p>打开「${esc(imported.title)}」，包含 ${imported.docs.length} 份文献、${imported.nodes.length} 个节点。当前项目会完整保留在「项目」列表，随时可以切回。</p>`,
          '<button class="button primary" id="restore-project">保存当前项目并打开新项目</button>',
        );
        $("#restore-project").onclick = async () => {
          const button=$("#restore-project");button.disabled=true;
          try { imported.projectId=uid();delete imported._cloudRevision; await switchProject(imported); }
          catch(e){toast(e.message);button.disabled=false;}
        };
        return;
      }
      let doc;
      if (/\.(pdf|docx)$/i.test(file.name) || file.type === "application/pdf") {
        toast("正在打开 " + file.name);
        doc = {
          id: uid(),
          name: file.name.replace(/\.(pdf|docx)$/i, ""),
          type: "pdf",
          data: arrayBase64(new Uint8Array(await file.arrayBuffer())),
          translations: {},
        };
        if(/\.docx$/i.test(file.name)){
          toast('正在将 Word 文献转换为保留图片和版面的 PDF…');
          doc.data=(await translationRequest('convert',{name:file.name,data:doc.data})).data;
        }
        const pdf = await loadPDF(doc);
        doc.pages = pdf.numPages;
      } else if (/\.(txt|md)$/i.test(file.name)) {
        doc = {
          id: uid(),
          name: file.name,
          type: "text",
          text: await file.text(),
          pages: 1,
          translations: {},
        };
      } else throw new Error("支持 PDF、DOCX、TXT、Markdown 和 .folio.json 项目");
      const previous={activeDoc:state.activeDoc,page:state.page};
      state.docs.push(doc);
      state.activeDoc = doc.id;
      state.page = 1;
      await renderReader();
      save();
      if(doc.type==='pdf'&&!translationAbort){
        const samplePages=[...new Set([1,Math.min(2,doc.pages),Math.min(3,doc.pages)])];
        const sample=(await Promise.all(samplePages.map(p=>extractPage(doc,p)))).map(p=>p.blocks.map(b=>b.text).join(' ')).join(' ');
        const language=detectDocumentLanguage(sample);
        if(language!=='zh')await offerFullTranslation(doc,state,language,previous);
      }
    } catch (e) {
      toast(e.message);
    }
  }
  $("#file-input").value = "";
}
async function importImages(files, { pasted = false } = {}) {
  const workspace = state;
  for (const file of files) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast("图片支持 PNG、JPEG、WebP");
      continue;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast("单张图片请控制在 12 MB 以内");
      continue;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (state !== workspace) return;
      const max = 2400,
        ratio = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * ratio;
      c.height = img.height * ratio;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const image = c.toDataURL("image/png");
      checkpoint();
      const n = makeNode({
        kind: "image",
        title: pasted ? "粘贴的图片" : file.name,
        text: "",
        image,
      });
      selected = new Set([n.id]);
      changed();
      centerNode(n.id);
    } catch {
      toast("这张图片无法解码");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  $("#image-input").value = "";
}
async function addFigure(side) {
  const svg = figureSVG(side === "zh"),
    url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  image.src = url;
  await image.decode();
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 360;
  c.getContext("2d").drawImage(image, 0, 0, 1000, 360);
  URL.revokeObjectURL(url);
  checkpoint();
  const n = makeNode({
    kind: "image",
    title: "阅读的循环",
    text: "观察 → 提问 → 关联 → 回顾",
    image: c.toDataURL(),
    source: {
      docId: "demo",
      page: 1,
      side,
      section: null,
      rects: [],
      text: "Figure 1. A reading loop: observe, question, connect, revisit.",
    },
  });
  selected = new Set([n.id]);
  changed();
  centerNode(n.id);
}
function stopCrop() {
  crop = null;
  for (const id of ["#crop-button", "#crop-zh-button"]) {
    $(id).classList.remove("active");
    $(id).setAttribute("aria-pressed", "false");
  }
  $$(".crop-overlay").forEach((el) => el.remove());
}
function toggleCrop(side) {
  if (crop === side) { stopCrop(); return; }
  const stack = readerStacks[side];
  const pages = stack
    ? stack.records.filter((r) => r.data?.canvas).map((r) => r.data)
    : [...$(side === "en" ? "#english-paper" : "#chinese-paper").querySelectorAll(".source-page,.translation-page")].map((sheet) => ({ sheet }));
  stopCrop();
  if (!pages.length) {
    toast(side === "zh" ? "请先加载中文译文，再框选截图。" : "页面加载完成后可框选截图。");
    return;
  }
  crop = side;
  const button = $(side === "en" ? "#crop-button" : "#crop-zh-button");
  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");
  getSelection()?.removeAllRanges();
  for (const rendered of pages) attachCropOverlay(rendered, side);
  toast("在" + (side === "zh" ? "中文" : "原文") + "页面拖动框选，松手后添加到画布；Esc 取消");
}
function attachCropOverlay(rendered, side) {
  if (rendered.sheet.querySelector(".crop-overlay")) return;
  const page = Number(rendered.sheet.dataset.page) || 1, doc = currentDoc(), workspace = state;
  const sheet = rendered.sheet, overlay = document.createElement("div");
  overlay.className = "crop-overlay";
  sheet.append(overlay);
  overlay.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    overlay.setPointerCapture(e.pointerId);
    const b = overlay.getBoundingClientRect(), start = { x: e.clientX - b.left, y: e.clientY - b.top };
    const area = document.createElement("div");
    area.className = "crop-area";
    overlay.append(area);
    let end = start;
    const update = (e) => {
      end = { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) };
      Object.assign(area.style, {
        left: Math.min(start.x, end.x) + "px", top: Math.min(start.y, end.y) + "px",
        width: Math.abs(end.x - start.x) + "px", height: Math.abs(end.y - start.y) + "px",
      });
    };
    overlay.onpointermove = update;
    overlay.onpointercancel = (e) => { e.stopPropagation(); stopCrop(); };
    overlay.onpointerup = async (e) => {
      e.stopPropagation();
      update(e);
      overlay.onpointerdown = overlay.onpointermove = overlay.onpointerup = null;
      const region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(start.x - end.x), h: Math.abs(start.y - end.y) };
      const parentId = selected.size === 1 ? [...selected][0] : null;
      try {
        if (region.w <= 8 || region.h <= 8) return;
        const image = await capturePageRegion(rendered, region);
        if (state !== workspace || state.activeDoc !== doc.id) return;
        checkpoint();
        const n = makeNode({
          kind: "image", title: (side === "zh" ? "中文截图" : "原文截图") + " · p." + page, text: "", image,
          source: {
            docId: doc.id, page, side, text: "图片 / 图表选区",
            rects: [{ x: region.x / b.width, y: region.y / b.height, w: region.w / b.width, h: region.h / b.height }],
            ...(side === "zh" && doc.translationPDF ? {
              translationPDFId: doc.translationPDF.id, translationPDFName: doc.translationPDF.name,
            } : {}),
          },
        }, parentId);
        selected = new Set([n.id]);
        changed();
        renderHighlights();
        centerNode(n.id);
        toast("截图已放入画布，点击图片可查看大图");
      } catch (error) {
        toast("截图失败，请重试：" + error.message);
      } finally {
        stopCrop();
        readerStacks[side]?.refresh();
      }
    };
  };
}
function exportProject() {
  const copy = structuredClone(state);
  delete copy.config;
  delete copy._cloudRevision;
  download(
    (state.title || "页间") + ".folio.json",
    JSON.stringify(copy),
    "application/json",
  );
}
function openExport() {
  modal(
    "带走你的思考",
    `<p>完整项目包含原文、译文、图片和对话。模型连接配置不会导出。</p><div class="export-grid"><button class="export-card" id="export-project">${icon("layers")}完整项目<small>.folio.json · 可重新导入，完整恢复</small></button><button class="export-card" id="export-md">${icon("file")}Markdown 与图片<small>.zip · 大纲、引用和关联，方便继续写作</small></button><button class="export-card" id="export-png">${icon("image")}画布图片<small>.png · 导出当前展开的节点</small></button><button class="export-card" id="export-pdf">${icon("download")}打印 / 存为 PDF<small>保留画布布局，用系统打印窗口保存</small></button></div>`,
  );
  $("#export-project").onclick = exportProject;
  $("#export-md").onclick = () => {
    const files = { "notes.md": markdown(state, state.nodes) };
    for (const n of state.nodes.filter((n) => n.image)) {
      files["images/" + n.id + ".png"] = Uint8Array.from(
        atob(n.image.split(",")[1]),
        (c) => c.charCodeAt(0),
      );
    }
    download(state.title + "-笔记.zip", zip(files));
  };
  $("#export-png").onclick = async () => {
    try {
      const c = await canvasImage(state, visibleNodes(state.nodes), appearance);
      c.toBlob((b) => download(state.title + ".png", b));
    } catch (e) {
      toast(e.message);
    }
  };
  $("#export-pdf").onclick = async () => {
    try {
      const c = await canvasImage(state, visibleNodes(state.nodes), appearance);
      let print = $(".print-only");
      if (!print) {
        print = document.createElement("div");
        print.className = "print-only";
        document.body.append(print);
      }
      print.replaceChildren();
      const h = document.createElement("h1");
      h.textContent = state.title;
      const img = new Image();
      img.src = c.toDataURL();
      print.append(h, img);
      await img.decode();
      $("#modal").close();
      window.print();
    } catch (e) {
      toast(e.message);
    }
  };
}
function openContext() {
  const initial = selected.size ? "branch" : "all";
  modal(
    "把思考带入下一次对话",
    `<label class="field-label" for="context-scope">包含哪些节点</label><select class="select-field" id="context-scope"><option value="selected" ${!selected.size ? "disabled" : ""}>仅选中节点</option><option value="branch" ${!selected.size ? "disabled" : ""} ${initial === "branch" ? "selected" : ""}>选中节点与全部后续分支</option><option value="all" ${initial === "all" ? "selected" : ""}>整个画布（包含折叠节点）</option></select><div class="context-options"><label><input type="checkbox" id="ctx-sources" checked> 原文出处</label><label><input type="checkbox" id="ctx-translation" checked> 译文</label><label><input type="checkbox" id="ctx-history" checked> 问题与历史</label><label><input type="checkbox" id="ctx-images" checked> 图片附件</label></div><textarea class="text-area context-preview" id="context-preview" readonly aria-label="发送内容预览"></textarea><div class="context-meta" id="context-meta"></div><label class="field-label" for="context-task">带着这些内容，你想让 AI 做什么？</label><textarea id="context-task" class="text-area" style="min-height:70px" placeholder="例如：基于这些证据，整理一份研究提纲，并指出尚未解决的问题。"></textarea>`,
    `<button class="button" id="copy-context">复制文本</button><button class="button" id="download-context">下载上下文包</button><button class="button primary" id="generate-context">生成新节点</button>`,
  );
  const collect = () => {
    const nodes = scopeNodes(state, $("#context-scope").value, selected),
      opts = {
        sources: $("#ctx-sources").checked,
        translation: $("#ctx-translation").checked,
        history: $("#ctx-history").checked,
      };
    const text = contextText(state, nodes, opts);
    const images = $("#ctx-images").checked
      ? nodes
          .filter((n) => n.image)
          .map((n) => ({ id: n.id, title: n.title, data: n.image }))
      : [];
    return { nodes, text, images };
  };
  const update = () => {
    const { nodes, text, images } = collect();
    $("#context-preview").value = text;
    $("#context-meta").textContent =
      `${nodes.length} 个节点 · ${text.length.toLocaleString()} 字符 · ${images.length} 张图片。复制文本不包含图片像素。`;
  };
  for (const el of $$("#modal select,#modal input[type=checkbox]"))
    el.onchange = update;
  update();
  $("#copy-context").onclick = async () => {
    const text = collect().text + "\n\n当前任务：" + $("#context-task").value;
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制上下文");
    } catch {
      $("#context-preview").focus();
      $("#context-preview").select();
      toast("请按 ⌘C / Ctrl+C 复制");
    }
  };
  $("#download-context").onclick = () => {
    const c = collect();
    download(
      "folio-context.json",
      JSON.stringify({
        format: "folio-context-v1",
        task: $("#context-task").value,
        context: c.text,
        images: c.images,
      }),
      "application/json",
    );
  };
  $("#generate-context").onclick = async () => {
    const workspace = state;
    const c = collect(),
      prompt = $("#context-task").value.trim();
    if (!prompt) {
      $("#context-task").focus();
      return;
    }
    if (!c.nodes.length) {
      toast("请先选择节点");
      return;
    }
    if (c.text.length > 100000) {
      toast("上下文超过 10 万字符，请缩小选择范围。");
      return;
    }
    checkpoint();
    const n = makeNode({
      kind: "ai",
      title: prompt,
      text: "",
      prompt,
      context: c.text,
      contextNodeIds: c.nodes.map((n) => n.id),
    });
    selected = new Set([n.id]);
    const controller = new AbortController();
    busy.set(n.id, controller);
    $("#modal").close();
    changed();
    centerNode(n.id);
    try {
      const literature = await collectLiterature(state,c.nodes,{signal:controller.signal,onProgress:message=>{
        aiProgress.set(n.id,message);
        const el=$(`[data-node-id="${CSS.escape(n.id)}"] .node-ai-progress span`);if(el)el.textContent=message;
      }});
      const context=c.text+literature.context;
      const content = [{type:"text",text:context+"\n\n用户任务："+prompt},...c.images.map(i=>({type:"image_url",image_url:{url:i.data}}))];
      const messages=[{role:"system",content:readingSystem},{role:"user",content}];
      const useCodex=(state.config.readingProvider||"codex")==="codex";
      const result=useCodex ? await askCodex(messages,state.config,controller.signal,{literature}) : {content:await askAI(messages,state.config,controller.signal)};
      if (state === workspace && getNode(n.id)) {
        Object.assign(getNode(n.id),{text:result.content,context,generatedAt:new Date().toISOString(),aiEvidence:{provider:useCodex?"codex":"api",model:result.model||state.config.model||"",reasoningEffort:result.reasoningEffort,attached:literature.attached,sources:result.sources||[],trace:result.trace||[],warnings:literature.warnings}});
      }
    } catch (e) {
      if (state === workspace) {
        if (getNode(n.id)) getNode(n.id).error = e.message;
        toast(e.message);
      }
    } finally {
      busy.delete(n.id);
      aiProgress.delete(n.id);
      if (state === workspace) changed();
    }
  };
}
function settings() {
  modal(
    "连接阅读助手",
    `<label class="field-label" for="reading-provider">问答与总结使用</label><select class="select-field" id="reading-provider"><option value="codex" ${(state.config.readingProvider||"codex")==="codex"?"selected":""}>Codex 阅读助手（本机登录）</option><option value="api" ${state.config.readingProvider==="api"?"selected":""}>OpenAI 兼容 API</option></select><p>Codex 会结合摘录、附近页面和分支历史回答，必要时检索本篇全文。使用你的 Codex 账户额度。</p><label class="field-label" for="codex-model">Codex 模型</label><select class="select-field" id="codex-model"><option value="">使用账户默认模型</option>${state.config.codexModel?`<option selected value="${esc(state.config.codexModel)}">${esc(state.config.codexModel)}</option>`:""}</select><button id="check-codex" class="small-button">检查 Codex</button><p id="codex-status">正在检查本机 Codex…</p><hr><p>完整 PDF 翻译使用上方所选 Codex 模型，包含正文和所有图片内的文字，并生成可下载的中文 PDF。下方 API 用于兼容服务问答及纯文本翻译。本机版本通过服务端转发请求，密钥不会进入浏览器或项目导出文件。</p><label class="field-label" for="api-endpoint">工作台网关地址（不是模型厂商地址）</label><input class="text-field" id="api-endpoint" value="${esc(state.config.endpoint || "/api/chat")}" placeholder="/api/chat"><label class="field-label" for="api-model">模型名称（留空使用服务端默认值）</label><input class="text-field" id="api-model" value="${esc(state.config.model || "")}" placeholder="使用你实际可用的模型名称"><details style="margin-top:18px"><summary style="font-size:12px;cursor:pointer">本机配置方法</summary><p>在项目目录复制 <code>.env.example</code> 为 <code>.env.local</code>，填写后重新启动工作台。</p><pre>FOLIO_AI_BASE_URL=https://你的服务商/v1\nFOLIO_AI_MODEL=你的模型名称\nFOLIO_AI_API_KEY=你的密钥</pre><p>运行 <code>npm run dev</code>，打开 <code>http://127.0.0.1:4318</code>。在线预览需使用你部署的 HTTPS 网关；它应接受 OpenAI messages 请求并返回 choices，且允许此站点跨域访问。</p></details><p id="connection-result"></p><label class="field-label">已学习的快捷操作</label><div id="shortcut-list">${state.shortcuts.length ? state.shortcuts.map((s) => `<div style="display:flex;justify-content:space-between;gap:8px;margin:9px 0"><span>${esc(s.label)}</span><button class="small-button" data-remove-shortcut="${s.id}">删除</button></div>`).join("") : "<p>同类提问超过 3 次后，会建议添加新的快捷操作。</p>"}</div>`,
    `<button id="test-connection" class="button">测试连接</button><button id="save-settings" class="button primary">保存设置</button>`,
  );
  $("#save-settings").onclick = () => {
    const endpoint = $("#api-endpoint").value.trim() || "/api/chat";
    try {
      const url = new URL(endpoint, location.href);
      if (url.username || url.password) throw new Error("地址中不能包含凭据");
      state.config = { endpoint, model: $("#api-model").value.trim(), readingProvider:$("#reading-provider").value, codexModel:$("#codex-model").value };
      disposeModelPicker?.refresh();
      save();
      $("#modal").close();
      checkStatus();
      toast("设置已保存");
    } catch (e) {
      toast(e.message);
    }
  };
  $("#test-connection").onclick = async () => {
    const button = $("#test-connection");
    button.disabled = true;
    $("#connection-result").textContent = "正在发送测试请求…";
    try {
      await askConfiguredAI([{ role: "user", content: "请只回复 OK。" }], {
        readingProvider:$("#reading-provider").value, codexModel:$("#codex-model").value,
        endpoint: $("#api-endpoint").value || "/api/chat",
        model: $("#api-model").value,
      });
      $("#connection-result").textContent = "连接成功，可以开始文献问答。";
      $("#ai-status").textContent = "AI 已连接";
    } catch (e) {
      $("#connection-result").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
  const checkCodex=async()=>{
    const status=$("#codex-status"), select=$("#codex-model");
    status.textContent="正在检查本机 Codex…";
    try {
      const r=await fetch("/api/codex/status",{headers:deviceHeaders()}), data=await r.json();
      if(!status.isConnected)return;
      const describe = () => {
        const model=(data.models||[]).find(m=>select.value?m.id===select.value:m.isDefault);
        status.textContent=data.authenticated?`当前模型：${model?.name || model?.id || "未确定"} · 推理强度：中等（${data.reasoningEffort || "medium"}）。`:data.error||"请先在 Codex 中完成登录，然后重新检查。";
      };
      select.onchange=describe;
      const value=select.value;
      select.innerHTML='<option value="">使用账户默认模型</option>'+(data.models||[]).map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
      if([...(select.options)].some(o=>o.value===value))select.value=value;
      describe();
    } catch {if(status.isConnected)status.textContent="请启动或更新本机工作台服务后重试。";}
  };
  $("#check-codex").onclick=checkCodex;
  checkCodex();
  $$("[data-remove-shortcut]").forEach(
    (el) =>
      (el.onclick = () => {
        state.shortcuts = state.shortcuts.filter(
          (s) => s.id !== el.dataset.removeShortcut,
        );
        save();
        el.parentElement.remove();
      }),
  );
}
async function checkStatus() {
  if((state.config.readingProvider||"codex")==="codex") {
    try {const r=await fetch("/api/codex/status",{headers:deviceHeaders()}), data=await r.json();const model=(data.models||[]).find(m=>state.config.codexModel?m.id===state.config.codexModel:m.isDefault);
      $("#ai-status").textContent=data.authenticated?`${model?.name || "Codex"} · 中等推理` : "Codex 待登录";
      $("#ai-status").title=data.authenticated?`模型：${model?.id || "未确定"}；推理强度：${data.reasoningEffort || "medium"}`:"";}
    catch {$("#ai-status").textContent="Codex 待连接";}
    return;
  }
  if (state.config.endpoint && state.config.endpoint !== "/api/chat") {
    $("#ai-status").textContent = "自定义 AI 服务";
    return;
  }
  try {
    const r = await fetch("/api/status");
    if (!r.ok) throw new Error();
    const data = await r.json();
    $("#ai-status").textContent = data.configured ? "AI 已配置" : "AI 待连接";
  } catch {
    $("#ai-status").textContent = "AI 待连接";
  }
}
function help() {
  modal(
    "让阅读，慢慢成为思考",
    `<ol class="help-list"><li>点击思考画布标题栏的「全屏」，三栏工作区一起铺满屏幕；点击「退出全屏」或按 Esc 返回。</li><li>在英文或中文中划选文字，摘录会立即出现在画布。浮框里可以直接保留、总结概括或自由提问。</li><li>双击节点标题或正文即可原位编辑，自动保存；Enter 换行，⌘ / Ctrl + Enter 或 Esc 结束编辑。点击「追问」继续对话。回答生成在下一级，点击节点右侧的数字展开或折叠。</li><li>拖动节点标题移动位置；拖动右边、底边或右下角调整节点宽高，双击右下角适应内容。拖动背景平移画布；滚轮缩放。按住 <span class="kbd">Shift</span> 框选多个节点。</li><li>从右侧圆点拖向子节点、从左侧拖向父节点，上下圆点用于关联。独立新节点按顺序放在画布下方。工具栏的「整理为思维导图」可重新排列全部节点。松手直接连线；已有连线的端点拖到空白处松手即可断开，多条线共享圆点时先点中具体连线。Esc 取消，⌘Z / Ctrl+Z 撤销。点击线上的文字可调整关系。</li><li>中英文阅读栏的框选工具都可截图，松手后进入画布。图片也可以拖入或按 ⌘V / Ctrl+V 粘贴；点击节点图片查看大图，可缩放或查看原始大小。</li><li>选中节点后点「作为 AI 上下文」，预览范围和来源，再复制、导出，或生成新的想法。</li><li>所有数据保存在当前浏览器。用「完整项目」备份，之后可通过「导入文献」恢复。</li></ol><p>快捷键：<span class="kbd">N</span> 新建笔记　<span class="kbd">⌘Z</span> 撤销　<span class="kbd">⌘⇧Z</span> 重做　<span class="kbd">Esc</span> 取消选择</p><p>扫描 PDF 需要先 OCR。复杂版式翻译采用文字块定位；标有虚线的段落可以滚动查看。问答默认使用本机已登录的 Codex，可在服务设置中切换为 API；全文翻译仍需要配置模型 API。</p>`,
  );
}
function applyConnection(request, previous = null) {
  const plan = planConnection(state, request, previous);
  return applyConnectionPlan(plan);
}
function applyConnectionPlan(plan) {
  if (!plan) return false;
  checkpoint();
  const moved = plan.nodes.filter(n => n.parentId && n.parentId !== getNode(n.id)?.parentId).map(n => n.id);
  // Keep node objects alive for an open note editor or an in-flight AI answer.
  for (const next of plan.nodes) {
    const node = getNode(next.id);
    node.parentId = next.parentId;
    if (next.parentLabel === undefined) delete node.parentLabel;
    else node.parentLabel = next.parentLabel;
    if (next.collapsed !== undefined) node.collapsed = next.collapsed;
  }
  state.edges = plan.edges;
  for (const id of moved) placeBranch(id);
  selectedEdgeKey = null;
  changed();
  return true;
}
function disconnect(reference) {
  if (!applyConnectionPlan(planDisconnect(state, reference))) return;
  selectedEdgeKey = null;
  toast("连接已断开，可按 ⌘Z / Ctrl+Z 撤销");
}
function editConnection(reference) {
  const child = reference.type === "parent" ? getNode(reference.to) : null;
  const edge = reference.type === "relation" ? state.edges.find((e) => e.id === reference.id) : null;
  if (!child?.parentId && !edge) return;
  const from = child?.parentId || edge.from, to = child?.id || edge.to;
  const previous = { ...reference, from, to };
  const a = getNode(from), b = getNode(to);
  if (!a || !b) return;
  const label = child ? child.parentLabel || "父子" : edge.label || "关联";
  modal(
    "调整关系",
    `<label class="field-label" for="connection-type">关系类型</label><select id="connection-type" class="select-field"><option value="parent" ${child ? "selected" : ""}>父子关系 · 改变节点层级</option><option value="relation" ${edge ? "selected" : ""}>关联关系 · 保持各自层级</option></select><label class="field-label" for="connection-direction">方向 · 父子关系中前者是父节点</label><select id="connection-direction" class="select-field"><option value="forward">${esc(a.title)} → ${esc(b.title)}</option><option value="reverse">${esc(b.title)} → ${esc(a.title)}</option></select><label class="field-label" for="edge-label-input">线上文字</label><input id="edge-label-input" class="text-field" value="${esc(label)}" maxlength="100" placeholder="例如：父子、关联、支持、延伸">`,
    '<button id="delete-edge" class="button danger">删除连线</button><button id="save-edge" class="button primary">保存</button>',
  );
  $("#connection-type").onchange = () => {
    const input = $("#edge-label-input");
    if (["父子", "关联", ""].includes(input.value.trim()))
      input.value = $("#connection-type").value === "parent" ? "父子" : "关联";
  };
  $("#save-edge").onclick = () => {
    try {
      const reverse = $("#connection-direction").value === "reverse";
      applyConnection({
        from: reverse ? to : from, to: reverse ? from : to,
        type: $("#connection-type").value, label: $("#edge-label-input").value,
        fromPort: reverse ? edge?.toPort : edge?.fromPort,
        toPort: reverse ? edge?.fromPort : edge?.toPort,
      }, previous);
      $("#modal").close();
    } catch (error) { toast(error.message); }
  };
  $("#delete-edge").onclick = () => {
    disconnect(previous);
    $("#modal").close();
  };
}
function clearConnection() {
  connection = null;
  $("#connection-preview")?.remove();
  $("#canvas").classList.remove("connecting");
  $$(".edge-group.detaching").forEach((el) => el.classList.remove("detaching"));
  $$(".connection-target").forEach((node) => node.classList.remove("connection-target"));
}
function clearEdgeSelection() {
  selectedEdgeKey = null;
  $$(".edge-group.selected").forEach((el) => el.classList.remove("selected"));
}
function deleteSelection() {
  if (!selected.size) return;
  checkpoint();
  for (const id of selected) busy.get(id)?.abort();
  for (const n of state.nodes) if (selected.has(n.parentId)) n.parentId = null;
  state.nodes = state.nodes.filter((n) => !selected.has(n.id));
  state.edges = state.edges.filter(
    (e) => !selected.has(e.from) && !selected.has(e.to),
  );
  selected.clear();
  closeDrawer();
  changed();
  renderHighlights();
  toast("节点已删除，后续节点保留。可撤销。");
}
function history(direction) {
  if (busy.size) {
    toast("请等待生成完成，或取消生成后再撤销");
    return;
  }
  const source = direction === "undo" ? undoStack : redoStack,
    target = direction === "undo" ? redoStack : undoStack;
  if (!source.length) return;
  target.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
  Object.assign(state, JSON.parse(source.pop()));
  selectedEdgeKey = null;
  selected.clear();
  closeDrawer();
  changed();
  renderHighlights();
}
function collapseSelection() {
  checkpoint();
  for (const id of selected) {
    const n = getNode(id);
    if (n) n.collapsed = !n.collapsed;
  }
  changed();
}
function bind(id, fn) {
  $(id).onclick = fn;
}
bind("#library-button", openLibrary);
bind("#choose-doc", openLibrary);
bind("#outline-button", openOutline);
bind("#context-rail", openContext);
bind("#context-button", openContext);
bind("#settings-button", settings);
bind("#translation-settings", settings);
bind("#help-button", help);
bind("#export-button", openExport);
bind("#import-button", () => $("#file-input").click());
bind("#import-translation", openTranslationImport);
$("#translation-file-input").onchange = (e) => attachTranslation(translationTarget, e.target.files[0]);
$("#file-input").onchange = (e) => importFiles([...e.target.files]);
$("#image-input").onchange = (e) => importImages([...e.target.files]);
bind("#add-image", () => $("#image-input").click());
bind("#new-note", () => {
  checkpoint();
  const n = makeNode();
  selected = new Set([n.id]);
  changed();
  editNode(n.id);
  centerNode(n.id);
});
bind("#undo", () => history("undo"));
bind("#redo", () => history("redo"));
bind("#zoom-in", () => zoom(1.18));
bind("#zoom-out", () => zoom(1 / 1.18));
bind("#fit-canvas", fitCanvas);
let workspaceFullscreen = false, fullscreenPending = false;
function updateWorkspaceFullscreen(active) {
  workspaceFullscreen = active;
  document.body.classList.toggle("workspace-fullscreen", active);
  const button = $("#workspace-fullscreen");
  button.innerHTML = icon(active ? "minimize" : "maximize") + (active ? "退出全屏" : "全屏");
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", active ? "退出工作区全屏" : "工作区全屏");
  button.title = active ? "退出全屏（Esc）" : "全屏显示原文、中文对照和思考画布";
  refreshWorkspaceSize();
}
async function toggleWorkspaceFullscreen() {
  if (fullscreenPending) return;
  fullscreenPending = true;
  try {
    if (workspaceFullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen();
      updateWorkspaceFullscreen(false);
    } else {
      // Fullscreen the document so editors, excerpt popups and image dialogs
      // remain available alongside the three panels.
      updateWorkspaceFullscreen(true);
      try {
        if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen)
          throw new Error("Fullscreen unavailable");
        await document.documentElement.requestFullscreen();
      } catch {
        toast("已铺满当前窗口；此浏览器暂不支持屏幕全屏。按 Esc 返回。");
      }
    }
  } catch {
    toast("未能退出屏幕全屏，请按 Esc 返回。");
  } finally {
    fullscreenPending = false;
  }
}
bind("#workspace-fullscreen", toggleWorkspaceFullscreen);
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && workspaceFullscreen) updateWorkspaceFullscreen(false);
  else refreshWorkspaceSize();
});
bind("#arrange-mindmap", () => { arrangeMindmap(); fitCanvas(); });
bind("#edit-selected", () => selected.size && editNode([...selected][0]));
bind("#delete-selected", deleteSelection);
bind("#collapse-selected", collapseSelection);
bind("#crop-button", () => toggleCrop("en"));
bind("#crop-zh-button", () => toggleCrop("zh"));
document.addEventListener("click", (e) => {
  const preview = e.target.closest("[data-view-image]");
  if (preview) openImagePreview(preview.dataset.viewImage);
});
bind("#image-viewer-close", () => $("#image-viewer").close());
bind("#image-fit", fitImagePreview);
bind("#image-actual", () => resizeImagePreview(1));
bind("#image-zoom-in", () => resizeImagePreview(imageViewerScale * 1.25));
bind("#image-zoom-out", () => resizeImagePreview(imageViewerScale / 1.25));
$("#image-viewer").addEventListener("close", () => {
  imageViewerToken++;
  $("#image-viewer-image").removeAttribute("src");
});
$("#image-viewer").addEventListener("click", (e) => {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
});
bind("#translate-button", translateDocument);
bind("#dismiss-popup", () => $("#selection-popup").classList.add("hidden"));
bind("#keep-excerpt", () => {
  setExcerptMode("quote", true);
});
bind("#ask-excerpt", () => setExcerptMode("question", true));
bind("#summarize", () => {
  setExcerptMode("summary");
  if (activeExcerpt) runNodeAI(activeExcerpt, "总结概括");
});
$("#excerpt-title").onfocus = () => { excerptTitleCheckpointed = false; };
$("#excerpt-title").oninput = () => {
  const node = getNode(activeExcerpt), value = $("#excerpt-title").value;
  if (excerptMode !== "quote" || !node || node.title === value) return;
  if (!excerptTitleCheckpointed) { checkpoint(); excerptTitleCheckpointed = true; }
  node.title = value;
  node.titleEdited = true;
  changed();
};
$("#excerpt-title-form").onsubmit = (e) => {
  e.preventDefault();
  if (excerptMode === "quote") $("#selection-popup").classList.add("hidden");
};
$("#selection-question-form").onsubmit = (e) => {
  e.preventDefault();
  const q = $("#selection-question").value.trim();
  if (excerptMode === "question" && q && activeExcerpt) runNodeAI(activeExcerpt, q);
};
bind("#projects-button", openProjects);
bind("#project-name", () => {
  modal(
    "工作台名称",
    '<input id="project-title-input" class="text-field" value="' +
      esc(state.title) +
      '" aria-label="工作台名称">',
    '<button id="rename-project" class="button primary">保存</button>',
  );
  $("#rename-project").onclick = () => {
    const title = $("#project-title-input").value.trim();
    if (title) {
      state.title = title;
      $("#project-name").textContent = title;
      save();
      $("#modal").close();
    }
  };
});
async function turnPage(page) {
  const p = Math.max(1, Math.min(currentDoc().pages, Math.floor(Number(page)) || 1));
  $("#page-input").value = p;
  $("#selection-popup").classList.add("hidden");
  CSS.highlights?.delete("search");
  if (readerStacks.en) {
    readerStacks.en.scrollTo({ page: p }, 21);
    readerStacks.zh?.scrollTo({ page: p }, 21);
    updateReaderPosition();
    await Promise.all([readerStacks.en.ensure(p, true), readerStacks.zh?.ensure(p, true)]);
  } else {
    state.page = p;
    await renderReader();
  }
  save();
}
bind("#prev-page", () => turnPage(state.page - 1));
bind("#next-page", () => turnPage(state.page + 1));
$("#page-input").onchange = (e) => turnPage(e.target.value);
$("#page-input").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    turnPage(e.target.value);
    e.target.blur();
  }
};
function updateZoomControls() {
  $$("[data-reader-zoom=settings]").forEach((el) => { el.textContent = Math.round(readerZoom * 100) + "%"; });
  $$("[data-reader-zoom=in]").forEach((el) => { el.disabled = readerZoom >= 3; });
  $$("[data-reader-zoom=out]").forEach((el) => { el.disabled = readerZoom <= 0.75; });
  $("#fit-content").classList.toggle("active", readerFitContent);
  $("#fit-content").setAttribute("aria-pressed", String(readerFitContent));
  $("#fit-content").disabled = currentDoc().type !== "pdf";
}
function saveReaderSettings() {
  state.reader = { zoom: readerZoom, fitContent: readerFitContent };
  save();
}
function setReaderZoom(zoom, delayed = false) {
  readerZoom = Math.round(Math.max(0.75, Math.min(3, zoom)) * 100) / 100;
  updateZoomControls();
  saveReaderSettings();
  clearTimeout(readerZoomTimer);
  if (delayed) readerZoomTimer = setTimeout(() => renderReader(), 100);
  else renderReader();
}
function openReaderZoom() {
  modal("中英文同步缩放", '<p>两栏使用同一倍率，向下滚动时保持大小。100% 适应当前栏宽；开启“适合正文”可减少白边。放大后支持横向滚动查看。</p><label class="field-label" for="reader-zoom-select">缩放倍率</label><select class="select-field" id="reader-zoom-select">' + [...new Set([75,100,125,150,175,200,250,300,Math.round(readerZoom*100)])].sort((a,b)=>a-b).map((n) => `<option value="${n}" ${Math.round(readerZoom*100) === n ? "selected" : ""}>${n}%</option>`).join("") + '</select><p>也可以在任一文献内按住 ⌘ / Ctrl 并滚动缩放。</p>', '<button class="button primary" id="apply-reader-zoom">应用到中英文献</button>');
  $("#apply-reader-zoom").onclick = () => { setReaderZoom(Number($("#reader-zoom-select").value) / 100); $("#modal").close(); };
}
$$("[data-reader-zoom]").forEach((el) => { el.onclick = () => {
  if (el.dataset.readerZoom === "settings") openReaderZoom();
  else setReaderZoom(readerZoom + (el.dataset.readerZoom === "in" ? 0.25 : -0.25));
}; });
bind("#fit-content", () => {
  readerFitContent = !readerFitContent;
  updateZoomControls();
  saveReaderSettings();
  renderReader();
});
for (const el of $$(".reader-scroll")) el.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setReaderZoom(readerZoom * Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002), true);
}, { passive: false });
bind("#sync-button", () => {
  sync = !sync;
  $("#sync-button").classList.toggle("active", sync);
  if (sync && readerStacks.en && readerStacks.zh) {
    readerStacks.zh.scrollTo(readerStacks.en.position());
    const from = readerStacks.en.scroll, to = readerStacks.zh.scroll;
    to.scrollLeft = from.scrollLeft / Math.max(1, from.scrollWidth - from.clientWidth) * Math.max(0, to.scrollWidth - to.clientWidth);
    syncedScroll.set(readerStacks.zh.scroll, { top: readerStacks.zh.scroll.scrollTop, left: readerStacks.zh.scroll.scrollLeft });
    updateReaderPosition();
  }
});
let scrolling = false;
const syncedScroll = new Map();
for (const [a, b] of [
  ["#english-scroll", "#chinese-scroll"],
  ["#chinese-scroll", "#english-scroll"],
])
  $(a).onscroll = () => {
    if (currentDoc().type === "pdf") {
      const from = a === "#english-scroll" ? readerStacks.en : readerStacks.zh;
      const to = a === "#english-scroll" ? readerStacks.zh : readerStacks.en;
      if (!from || !to) return;
      from.refresh();
      const expected = syncedScroll.get(from.scroll);
      syncedScroll.delete(from.scroll);
      if (sync && (expected === undefined || Math.abs(expected.top - from.scroll.scrollTop) > 1 || Math.abs(expected.left - from.scroll.scrollLeft) > 1)) {
        to.scrollTo(from.position());
        to.scroll.scrollLeft = from.scroll.scrollLeft / Math.max(1, from.scroll.scrollWidth - from.scroll.clientWidth) * Math.max(0, to.scroll.scrollWidth - to.scroll.clientWidth);
        syncedScroll.set(to.scroll, { top: to.scroll.scrollTop, left: to.scroll.scrollLeft });
      }
      updateReaderPosition();
      return;
    }
    if (!sync || scrolling) return;
    scrolling = true;
    const from = $(a),
      to = $(b);
    let aligned = false;
    const sections = [...from.querySelectorAll("[data-section]")];
    for (let i = sections.length - 1; i >= 0; i--) {
      const r = sections[i].getBoundingClientRect(),
        top = from.getBoundingClientRect().top;
      if (r.top <= top + 80) {
        const target = to.querySelector(
          `[data-section="${CSS.escape(sections[i].dataset.section)}"]`,
        );
        if (target) {
          const delta = (top + 80 - r.top) / Math.max(1, r.height);
          to.scrollTop +=
            target.getBoundingClientRect().top -
            to.getBoundingClientRect().top -
            80 +
            delta * target.offsetHeight;
          aligned = true;
        }
        break;
      }
    }
    if (!aligned) {
      const ratio =
        from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
    }
    requestAnimationFrame(() => (scrolling = false));
  };
function setTranslation(show) {
  $(".translation-panel").classList.toggle("hidden", !show);
  $(".splitter[data-split=zh]").classList.toggle("hidden", !show);
  $("#show-translation").classList.toggle("hidden", show);
  if (show) {
    $(".translation-panel").style.display = "flex";
    $(".splitter[data-split=zh]").style.display = "block";
  }
  fitPanelWidths();
  renderReader();
}
bind("#hide-translation", () => setTranslation(false));
bind("#show-translation", () => setTranslation(true));
bind("#search-button", () => {
  $("#search-strip").classList.toggle("hidden");
  $("#search-input").focus();
});
bind("#search-close", () => {
  $("#search-strip").classList.add("hidden");
  CSS.highlights?.delete("search");
});
async function search() {
  const term = $("#search-input").value.toLowerCase();
  CSS.highlights?.delete("search");
  if (!term) return;
  const page = state.page;
  if (readerStacks.en) await readerStacks.en.ensure(page, true);
  const host = readerStacks.en?.get(page)?.sheet || $("#english-paper");
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement.closest(".highlight-layer,.crop-overlay")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let node;
  const ranges = [];
  while ((node = walker.nextNode())) {
    const str = node.textContent.toLowerCase();
    let start = 0;
    while ((start = str.indexOf(term, start)) >= 0) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + term.length);
      ranges.push(range);
      start += term.length;
    }
  }
  $("#search-count").textContent = ranges.length + " 处";
  if (ranges.length) {
    const range = ranges[searchIndex++ % ranges.length];
    if (CSS.highlights) CSS.highlights.set("search", new Highlight(...ranges));
    range.startContainer.parentElement.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }
}
$("#search-input").onkeydown = (e) => {
  if (e.key === "Enter") search();
};
bind("#search-next", search);
function panelWidthLimits(target) {
  const panels = $("#panels"),
    canvasMin = parseFloat(getComputedStyle($(".canvas-panel")).minWidth),
    otherWidth = [...panels.children]
      .filter((panel) => panel !== target && !panel.matches(".canvas-panel"))
      .reduce((sum, panel) => sum + panel.getBoundingClientRect().width, 0),
    min = parseFloat(getComputedStyle(target).minWidth);
  return { min, max: Math.max(min, panels.clientWidth - otherWidth - canvasMin) };
}
function resizePanel(target, width) {
  const { min, max } = panelWidthLimits(target);
  target.style.width = Math.max(min, Math.min(max, width)) + "px";
}
function fitPanelWidths() {
  // A narrower window or reopening the translation must not push the canvas
  // and its divider outside the workspace.
  const readers = $$(".reader-panel").filter((panel) => !panel.classList.contains("hidden")),
    widths = readers.map((panel) => panel.getBoundingClientRect().width),
    minima = readers.map((panel) => parseFloat(getComputedStyle(panel).minWidth)),
    dividerWidth = $$(".splitter").reduce((sum, panel) => sum + panel.getBoundingClientRect().width, 0),
    excess = widths.reduce((sum, width) => sum + width, 0) + dividerWidth
      + parseFloat(getComputedStyle($(".canvas-panel")).minWidth) - $("#panels").clientWidth,
    room = widths.reduce((sum, width, i) => sum + Math.max(0, width - minima[i]), 0);
  if (excess <= 0 || !room) return;
  readers.forEach((panel, i) => {
    panel.style.width = Math.max(minima[i], widths[i] - excess * (widths[i] - minima[i]) / room) + "px";
  });
}
for (const splitter of $$(".splitter")) {
  splitter.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target =
        splitter.dataset.split === "en"
          ? $(".english-panel")
          : $(".translation-panel"),
      width = target.offsetWidth,
      start = e.clientX;
    splitter.setPointerCapture(e.pointerId);
    const move = (e) => {
      resizePanel(target, width + e.clientX - start);
    };
    const end = () => {
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", end);
      splitter.removeEventListener("pointercancel", end);
      renderReader();
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", end);
    splitter.addEventListener("pointercancel", end);
  });
  splitter.onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const target =
      splitter.dataset.split === "en"
        ? $(".english-panel")
        : $(".translation-panel");
    resizePanel(target, target.offsetWidth + (e.key === "ArrowRight" ? 15 : -15));
    renderReader();
  };
}
$("#nodes").addEventListener("click", (e) => {
  const cancel=e.target.closest("[data-cancel-ai]");
  if(cancel){busy.get(cancel.dataset.cancelAi)?.abort();return;}
  if (nodeWasDragged || e.target.closest("[data-view-image]")) return;
  const source = e.target.closest("[data-source]"),
    follow = e.target.closest("[data-followup]"),
    collapse = e.target.closest("[data-collapse]"),
    card = e.target.closest(".node");
  if (source) {
    revealSource(source.dataset.source);
    return;
  }
  if (follow) {
    editNode(follow.dataset.followup, true);
    return;
  }
  if (collapse) {
    checkpoint();
    const n = getNode(collapse.dataset.collapse);
    n.collapsed = !n.collapsed;
    changed();
    return;
  }
  if (card && !e.target.closest(".port"))
    selectNode(card.dataset.nodeId, e.shiftKey);
});
$("#nodes").addEventListener("dblclick", (e) => {
  const card = e.target.closest(".node");
  if (card && e.target.closest("[data-resize]")) {
    e.preventDefault();
    fitNodeToContent(card.dataset.nodeId);
    return;
  }
  if (card && !nodeWasDragged && !e.target.closest("button")) {
    e.preventDefault();
    startInlineEdit(card.dataset.nodeId, e.target.closest(".node-header") ? "title" : "text");
  }
});
$("#nodes").addEventListener("keydown", (e) => {
  const handle = e.target.closest("[data-resize]");
  if (handle && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    const card = handle.closest(".node"), node = getNode(card.dataset.nodeId), direction = handle.dataset.resize;
    const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (horizontal ? !direction.includes("e") : !direction.includes("s")) return;
    checkpoint();
    if (horizontal) node.width = Math.max(180, Math.min(800, card.offsetWidth + (e.key === "ArrowRight" ? 10 : -10)));
    else { node.height = Math.max(118, Math.min(2000, card.offsetHeight + (e.key === "ArrowDown" ? 10 : -10))); delete node.fitContent; }
    applyNodeSize(card, node);
    renderEdges();
    syncSizingControls();
    save();
    return;
  }
  if (handle && ["Enter", " "].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    fitNodeToContent(handle.closest(".node").dataset.nodeId);
    return;
  }
  if (e.key === "Enter" && e.target.matches(".node")) {
    e.preventDefault();
    startInlineEdit(e.target.dataset.nodeId, "text");
  }
});
$("#edge-paths").onclick = (e) => {
  if (nodeWasDragged) return;
  const el = e.target.closest(".edge-label");
  if (el) editConnection(el.dataset.parentEdge
    ? { type: "parent", to: el.dataset.parentEdge }
    : { type: "relation", id: el.dataset.edge });
  else if (e.target.closest(".edge-group")) {
    selected.clear();
    renderSelection();
    renderHighlights();
    selectedEdgeKey = e.target.closest(".edge-group").dataset.edgeKey;
    $$(".edge-group").forEach((group) => group.classList.toggle("selected", group.dataset.edgeKey === selectedEdgeKey));
  }
};
$("#edge-paths").onkeydown = (e) => {
  const endpoint = e.target.closest(".edge-endpoint");
  if (endpoint && ["Delete", "Backspace"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    disconnect(edgeReference(endpoint.closest(".edge-group")));
    $("#canvas").focus({ preventScroll: true });
    return;
  }
  if (endpoint && ["Enter", " "].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    $("#edge-paths").onclick(e);
    return;
  }
  if (["Enter", " "].includes(e.key) && e.target.matches(".edge-label")) {
    e.preventDefault();
    $("#edge-paths").onclick(e);
  }
};
$("#canvas").addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  nodeWasDragged = false;
  const endpoint = e.target.closest(".edge-endpoint");
  if (endpoint) {
    e.preventDefault();
    const group = endpoint.closest(".edge-group"), reference = edgeReference(group);
    const edge = reference.type === "relation" ? state.edges.find((item) => item.id === reference.id) : null;
    $("#canvas").focus({ preventScroll: true });
    connection = {
      mode: "detach", reference, endpoint: endpoint.dataset.endpoint, group,
      curve: connectionCurve(nodeBox(reference.from), nodeBox(reference.to), { ...edge, type: reference.type }),
      startX: e.clientX, startY: e.clientY,
    };
    $("#canvas").classList.add("connecting");
    endpoint.setPointerCapture(e.pointerId);
    return;
  }
  const card = e.target.closest(".node"),
    port = e.target.closest(".port");
  const resize = e.target.closest("[data-resize]");
  if (resize && card) {
    e.preventDefault();
    const node = getNode(card.dataset.nodeId);
    clearEdgeSelection();
    selected = new Set([node.id]);
    renderSelection();
    $("#canvas").focus({ preventScroll: true });
    drag = {
      type: "resize", id: node.id, direction: resize.dataset.resize,
      startX: e.clientX, startY: e.clientY, scale: state.view.scale,
      width: card.offsetWidth, height: card.offsetHeight,
      before: { width: node.width, height: node.height, fitContent: node.fitContent },
      undoBefore: [...undoStack], redoBefore: [...redoStack],
    };
    card.classList.add("resizing");
    resize.setPointerCapture(e.pointerId);
    return;
  }
  if (port && card) {
    e.preventDefault();
    $("#canvas").focus({ preventScroll: true });
    const attached = connectionsAtPort(card.dataset.nodeId, port.dataset.port);
    connection = {
      from: card.dataset.nodeId,
      port: port.dataset.port,
      startX: e.clientX,
      startY: e.clientY,
      attached,
      detach: attached.find((item) => item.group.dataset.edgeKey === selectedEdgeKey) || (attached.length === 1 ? attached[0] : null),
    };
    $("#canvas").classList.add("connecting");
    port.setPointerCapture(e.pointerId);
    return;
  }
  if (
    e.target.closest(
      "button,input,textarea,.canvas-tools,.selection-actions,.edge-hit,.edge-label,.edge-endpoint",
    )
  )
    return;
  const rect = $("#canvas").getBoundingClientRect();
  if (!card) clearEdgeSelection();
  if (card) {
    if (!e.target.closest(".node-header")) return;
    e.preventDefault();
    $("#canvas").focus({ preventScroll: true });
    const selection = selected.has(card.dataset.nodeId)
      ? new Set(selected)
      : new Set(e.shiftKey ? [...selected, card.dataset.nodeId] : [card.dataset.nodeId]);
    const ids = new Set(selection);
    for (const id of selection)
      for (const n of descendants(state.nodes, id)) ids.add(n.id);
    drag = {
      type: "node",
      selection,
      startX: e.clientX,
      startY: e.clientY,
      positions: state.nodes
        .filter((n) => ids.has(n.id))
        .map((n) => ({ id: n.id, x: n.x, y: n.y })),
    };
  } else if (e.shiftKey) {
    drag = {
      type: "box",
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    $("#drag-box").classList.remove("hidden");
  } else {
    drag = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      x: state.view.x,
      y: state.view.y,
    };
  }
  // Capturing on the header preserves its click target; capturing on the
  // canvas would redirect the clicks away from the node's double-click handler.
  (card ? card.querySelector(".node-header") : $("#canvas")).setPointerCapture(e.pointerId);
});
function canvasBlankAt(e) {
  const target = document.elementFromPoint(e.clientX, e.clientY);
  return target?.closest("#canvas") && !target.closest(".node,.canvas-tools,.selection-actions,.edge-group");
}
function detachedPreview(e, pending, path, x, y) {
  const origin = pending.endpoint === "from" ? pending.curve.end : pending.curve.start;
  pending.group.classList.add("detaching");
  path.classList.toggle("disconnect-preview", !!canvasBlankAt(e));
  path.setAttribute("d", `M${origin.x},${origin.y} L${x},${y}`);
}
document.addEventListener("pointermove", (e) => {
  if (connection) {
    const r = $("#canvas").getBoundingClientRect(),
      v = state.view;
    const x = (e.clientX - r.left - v.x) / v.scale,
      y = (e.clientY - r.top - v.y) / v.scale;
    const hovered = document.elementFromPoint(e.clientX, e.clientY), target = hovered?.closest(".node");
    const targetId = target?.dataset.nodeId;
    $$(".connection-target").forEach((node) => node.classList.toggle("connection-target", node === target));
    if (targetId && targetId !== connection.from) target.classList.add("connection-target");
    let path = $("#connection-preview");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.id = "connection-preview";
      path.classList.add("link-preview");
      $("#edges").append(path);
    }
    if (connection.mode === "detach") {
      if (Math.hypot(e.clientX - connection.startX, e.clientY - connection.startY) > 8)
        detachedPreview(e, connection, path, x, y);
      return;
    }
    if (connection.detach && canvasBlankAt(e)) {
      detachedPreview(e, connection.detach, path, x, y);
      return;
    }
    connection.detach?.group.classList.remove("detaching");
    path.classList.remove("disconnect-preview");
    if (targetId && targetId !== connection.from) {
      const request = connectionFromPort(connection.from, targetId, connection.port, hovered.closest(".port")?.dataset.port);
      path.setAttribute("d", connectionCurve(nodeBox(request.from), nodeBox(request.to), request).path);
    } else {
      const start = portPoint(nodeBox(connection.from), connection.port);
      path.setAttribute("d", `M${start.x},${start.y} L${x},${y}`);
    }
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.startX,
    dy = e.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.abs(dx) + Math.abs(dy) <= 3) return;
    drag.moved = true;
    if (drag.type === "node") {
      checkpoint();
      selected = drag.selection;
      renderSelection();
    }
    if (drag.type === "resize") {
      checkpoint();
      drag.undoEntry = undoStack.at(-1);
    }
  }
  if (drag.type === "resize") {
    const node = getNode(drag.id), card = $(`[data-node-id="${CSS.escape(drag.id)}"]`);
    if (!node || !card) { cancelNodeResize(); return; }
    if (drag.direction.includes("e")) node.width = Math.round(Math.max(180, Math.min(800, drag.width + dx / drag.scale)));
    if (drag.direction.includes("s")) {
      node.height = Math.round(Math.max(118, Math.min(2000, drag.height + dy / drag.scale)));
      delete node.fitContent;
    }
    applyNodeSize(card, node);
    syncSizingControls();
    renderEdges();
    return;
  }
  if (drag.type === "pan") {
    state.view.x = drag.x + dx;
    state.view.y = drag.y + dy;
    applyView();
  }
  if (drag.type === "node") {
    for (const p of drag.positions) {
      const n = getNode(p.id);
      if (n) {
        n.x = p.x + dx / state.view.scale;
        n.y = p.y + dy / state.view.scale;
        const el = $(`[data-node-id="${CSS.escape(n.id)}"]`);
        if (el) {
          el.style.left = n.x + "px";
          el.style.top = n.y + "px";
        }
      }
    }
    renderEdges();
  }
  if (drag.type === "box") {
    Object.assign($("#drag-box").style, {
      left: Math.min(drag.x, drag.x + dx) + "px",
      top: Math.min(drag.y, drag.y + dy) + "px",
      width: Math.abs(dx) + "px",
      height: Math.abs(dy) + "px",
    });
  }
});
document.addEventListener("pointercancel", () => {
  if (drag?.type === "resize") { cancelNodeResize(); return; }
  clearConnection();
  drag = null;
  $("#drag-box").classList.add("hidden");
  renderCanvas();
});
document.addEventListener("pointerup", (e) => {
  if (connection) {
    const hovered = document.elementFromPoint(e.clientX, e.clientY), target = hovered?.closest(".node");
    const pending = connection;
    const moved = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) > 8;
    const blank = canvasBlankAt(e);
    clearConnection();
    nodeWasDragged = moved;
    if (pending.mode === "detach") {
      if (moved && blank) disconnect(pending.reference);
      return;
    }
    if (moved && blank && pending.detach) {
      disconnect(pending.detach.reference);
      return;
    }
    if (moved && blank && pending.attached?.length > 1) {
      toast("这里有多条连接，点中具体连线后，拖开它的端点即可断开");
      return;
    }
    if (target && target.dataset.nodeId !== pending.from) {
      try {
        applyConnection(connectionFromPort(pending.from, target.dataset.nodeId, pending.port, hovered.closest(".port")?.dataset.port));
      } catch (error) { toast(error.message); }
    }
    return;
  }
  if (!drag) return;
  if (drag.type === "resize") {
    const pending = drag;
    drag = null;
    nodeWasDragged = !!pending.moved;
    if (pending.moved) changed();
    else $(`[data-node-id="${CSS.escape(pending.id)}"]`)?.classList.remove("resizing");
    return;
  }
  if (drag.type === "node") {
    nodeWasDragged = !!drag.moved;
    if (drag.moved) {
      renderSelection();
      renderHighlights();
      save();
    }
    drag = null;
    return;
  }
  if (drag.type === "box") {
    const r = $("#drag-box").getBoundingClientRect();
    selected = new Set(
      $$(".node")
        .filter((el) => {
          const n = el.getBoundingClientRect();
          return (
            n.left < r.right &&
            n.right > r.left &&
            n.top < r.bottom &&
            n.bottom > r.top
          );
        })
        .map((el) => el.dataset.nodeId),
    );
    $("#drag-box").classList.add("hidden");
  }
  if (drag.type === "pan" && !drag.moved) selected.clear();
  drag = null;
  renderSelection();
  renderHighlights();
  save();
});
$("#canvas").addEventListener(
  "wheel",
  (e) => {
    if (drag?.type === "resize") { e.preventDefault(); return; }
    if (e.target.closest(".node-body")) return;
    e.preventDefault();
    const r = $("#canvas").getBoundingClientRect();
    zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
$("#canvas").ondragover = (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
};
$("#canvas").addEventListener("paste", (e) => {
  if (
    e.defaultPrevented ||
    $("#modal").open ||
    e.target.isContentEditable ||
    e.target.closest("input,textarea,select,[role=textbox]")
  )
    return;
  const clipboard = e.clipboardData;
  if (!clipboard) return;
  let files = [...clipboard.files].filter((file) => file.type.startsWith("image/"));
  if (!files.length)
    files = [...clipboard.items]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  // Keep focus available for repeated paste and undo after rendering.
  $("#canvas").focus({ preventScroll: true });
  importImages(files, { pasted: true });
});
$("#canvas").ondrop = (e) => {
  e.preventDefault();
  const figure = e.dataTransfer.getData("application/x-folio-figure");
  if (figure) addFigure(figure);
  else importImages([...e.dataTransfer.files]);
};
document.addEventListener("keydown", (e) => {
  if (e.target.closest("dialog")) return;
  if (e.key === "Escape") {
    if (drag?.type === "resize") { cancelNodeResize(); return; }
    if (crop) { stopCrop(); return; }
    if (workspaceFullscreen) { e.preventDefault(); toggleWorkspaceFullscreen(); return; }
    $("#selection-popup").classList.add("hidden");
    closeDrawer();
    selected.clear();
    clearConnection();
    selectedEdgeKey = null;
    renderCanvas();
    return;
  }
  if (
    e.target.matches("input,textarea,select,[contenteditable=true]") ||
    $("#modal").open
  )
    return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    history(e.shiftKey ? "redo" : "undo");
  } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) {
    $("#new-note").click();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    const group = $$(".edge-group").find((el) => el.dataset.edgeKey === selectedEdgeKey);
    if (group) disconnect(edgeReference(group));
    else deleteSelection();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#selection-popup,#english-paper,#chinese-paper"))
    $("#selection-popup").classList.add("hidden");
});
let resizeTimer;
function refreshWorkspaceSize() {
  fitPanelWidths();
  positionExcerptPopup();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderReader(), 250);
}
window.addEventListener("resize", refreshWorkspaceSize);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") writeSaved(state).catch(() => {});
});
hydrate();
$("#project-name").textContent = state.title;
renderCanvas();
if (state.canvasLayout !== "mindmap-lr-v1") {
  await Promise.all($$("#nodes img").map(img => img.decode().catch(() => {})));
  arrangeMindmap();
  fitCanvas();
}
await renderReader();
checkStatus();
const unfinished=state.docs.find(d=>d.type==='pdf'&&!d.translationPDF&&d.fullTranslation?.id&&['queued','running'].includes(d.fullTranslation.status));
if(unfinished)translateFullPDF(unfinished,state,{resume:true});
if (!(await readSaved().catch(() => null))) setTimeout(fitCanvas, 150);

async function receiveFeishu(incoming,choice){
 const active=state.projectId===incoming.projectId;
 if(active&&(inlineEditor.active||editorId||busy.size||drag||document.activeElement?.matches('input,textarea,[contenteditable="true"]')))return {deferred:true};
 const previous=active?structuredClone(state):await readSavedProject(incoming.projectId);
 if(!previous)return {deferred:true};
 if(previous.feishuReceipt===incoming.token)return {count:0};
 const result=mergeFeishuChanges(previous,incoming.changes,choice,incoming.additions);
 if(result.conflicts.length)return result;
 result.project.feishuReceipt=incoming.token;
 // Mutation of live state is synchronous; no user keystrokes can interleave here.
 if(active){checkpoint();clearTimeout(saveTimer);state=result.project;renderCanvas();}
 try{await writeFeishuProject(previous,result.project);}catch(e){if(active){state=previous;renderCanvas();}throw e;}
 if(active&&result.count)toast('已接收飞书修改，原版本已备份，可撤销');
 return result;
}
const feishuSync=createFeishuSync({list:listSavedProjects,read:async id=>id===state.projectId?structuredClone(state):readSavedProject(id),apply:receiveFeishu,answerComment:(job,project,progress)=>answerComment(job,{...project,config:state.config},progress),onStatus:message=>{$("#feishu-sync-button").title=message;}});
window.addEventListener('folio-project-saved',e=>feishuSync.schedule(e.detail));
$("#feishu-sync-button").onclick=async()=>{
 try{
  await writeSaved(state);const sync=await feishuSync.status();
  modal('飞书自动同步',`<p>目标：<a href="${esc(sync.parentUrl)}" target="_blank" rel="noopener">文献阅读</a>。每个项目对应一篇文档。</p><p>节点按父子层级生成标题与正文；图片放在所属节点处；原始问题、引用页码和跨节点关联一起保存。英文原文和中文译本上传为文件并附链接。</p><p>工作台 ↔ 飞书双向同步。工作台保存后约 8 秒提交；每约 15 秒检查飞书已有节点的标题、正文和原始问题，并更新画布。编辑中的节点会等待你结束编辑。${isCloud?'由云端后台持续运行，页面关闭也会检查；需要有效云端飞书授权及可用模型。':'需要工作台页面和本机服务运行。'}图片、出处或整节结构变化暂时保留并提示；双方同时修改同一字段时需选择版本。</p><p><b>${sync.enabled?'自动同步已开启':'自动同步已暂停'}</b></p><hr><h3>飞书评论 · 问问 AI</h3><p>选中文字后评论 <b>AI：你的问题</b>；在同一评论继续回复即可追问。只处理你自己的评论。解释默认只回复；明确要求“添加到正文”才生成子节点，“改写这段”才替换选区。${isCloud?'使用「在线与本机」配置的后台模型及 API 后备。':'使用工作台当前选择的模型。'}</p><button class="button" id="feishu-comments-toggle">${sync.comments?.enabled?'暂停评论 AI':'开启评论 AI'}</button><details><summary>持久偏好与提问类型</summary>${(sync.comments?.preferences||[]).map(p=>`<p>${esc(p.scope==='global'?'全部项目':'当前项目')}：${esc(p.text)} <button class="button" data-preference-disable="${esc(p.id)}">停用</button></p>`).join('')||'<p>明确说“以后”或“记住”后会记录在这里。</p>'}${Object.entries(sync.comments?.categories||{}).map(([name,c])=>`<p>${esc(name)} · ${c.count} 次${c.shortcutCandidate?' · 可提炼为快捷操作':''}</p>`).join('')}</details><details><summary>评论处理记录</summary>${(sync.comments?.jobs||[]).slice().reverse().map(j=>`<p>${esc(j.question)}<br>${esc(({generating:'正在生成',awaiting_canvas:'等待画布接收',replying:'等待评论回复',done:'已完成',failed:'失败，可重试',needs_review:'写入结果需核对',reply_blocked:'评论已关闭'})[j.status]||j.status)} · ${esc(j.model||'')}${j.error?'<br>'+esc(j.error):''}${j.status==='failed'?` <button class="button" data-comment-retry="${esc(j.id)}">重试</button>`:''}</p>`).join('')||'<p>暂无 AI 评论。</p>'}</details><hr>${sync.projects.map(p=>`<div class="project-entry"><strong>${esc(p.title)}</strong><p>${esc(p.message||p.status)}${p.updatedAt?' · '+new Date(p.updatedAt).toLocaleString():''}</p>${p.conflicts?.length?`<p>同一字段有 ${p.conflicts.length} 处冲突</p>${p.conflicts.map(c=>`<details><summary>${esc(c.title)} · ${esc(c.field)}</summary><p>工作台：</p><pre style="white-space:pre-wrap">${esc(c.local)}</pre><p>飞书：</p><pre style="white-space:pre-wrap">${esc(c.remote)}</pre></details>`).join('')}<button class="button" data-feishu-resolve="${esc(p.id)}" data-choice="local">冲突处保留工作台版本</button><button class="button" data-feishu-resolve="${esc(p.id)}" data-choice="remote">冲突处采用飞书版本</button>`:''}${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">打开飞书文档</a>`:''}</div>`).join('')}`,`<button class="button" id="feishu-refresh">刷新状态</button><button class="button primary" id="feishu-toggle">${sync.enabled?'暂停自动同步':'开启并同步全部项目'}</button>${sync.enabled?'<button class="button" id="feishu-retry">重试同步</button>':''}`);
  $$('[data-feishu-resolve]').forEach(button=>button.onclick=async()=>{try{button.disabled=true;await feishuSync.resolve(button.dataset.feishuResolve,button.dataset.choice);$('#feishu-sync-button').click();}catch(e){toast(e.message);}});
  $('#feishu-comments-toggle').onclick=async()=>{try{await feishuSync.configureComments(!sync.comments?.enabled);$('#feishu-sync-button').click();}catch(e){toast(e.message);}};
  $$('[data-comment-retry]').forEach(b=>b.onclick=async()=>{b.disabled=true;await feishuSync.retryComment(b.dataset.commentRetry);$('#feishu-sync-button').click();});
  $$('[data-preference-disable]').forEach(b=>b.onclick=async()=>{await feishuSync.disablePreference(b.dataset.preferenceDisable);$('#feishu-sync-button').click();});
  $('#feishu-refresh').onclick=()=>$('#feishu-sync-button').click();
  $('#feishu-toggle').onclick=async()=>{try{$('#feishu-toggle').disabled=true;await feishuSync.enable(!sync.enabled);$('#feishu-sync-button').click();}catch(e){toast(e.message);}};
  if($('#feishu-retry'))$('#feishu-retry').onclick=async()=>{await feishuSync.enable(true);$('#feishu-sync-button').click();};
 }catch(e){toast(e.message);}
};
feishuSync.start();

if(isCloud){
  document.querySelector('#save-status').textContent='在线版 · 云端保存';
  let refreshing=false;
  setInterval(async()=>{
    if(refreshing||inlineEditor.active||editorId||busy.size||drag||translationAbort||document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return;
    refreshing=true;const previous=state;
    try{const next=await cloudRefresh(previous);if(next&&state===previous&&!inlineEditor.active&&!editorId&&!busy.size&&!drag){
      clearTimeout(saveTimer);state=next;selected.clear();undoStack=[];redoStack=[];
      document.querySelector('#project-name').textContent=state.title;renderCanvas();await renderReader();toast('已接收云端更新（其他设备或飞书）');
    }}catch(e){document.querySelector('#save-status').textContent=e.status===401?'登录已过期':'云端暂不可达，草稿保留在此浏览器';}finally{refreshing=false;}
  },15000);
}
