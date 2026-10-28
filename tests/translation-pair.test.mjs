import test from "node:test";
import assert from "node:assert/strict";
import { pairedTranslation, validateProject, validateDetails, contextText, markdown } from "../dist/model.js";

const original = () => ({ id: "english", name: "English paper", type: "pdf", pages: 41, data: "JVBERi0xLjc=", translations: {} });
const translated = () => ({ id: "library-zh", name: "中文同版式", type: "pdf", pages: 41, data: "JVBERi0xLjQ=", translations: {} });
const project = () => ({ version: 1, title: "阅读", docs: [original(), translated()], nodes: [], edges: [] });

test("paired PDFs survive project export and restore without altering the original or library item", () => {
  const s = project();
  const before = structuredClone(s.docs);
  s.docs[0].translationPDF = pairedTranslation(s.docs[0], s.docs[1], "attachment");
  const restored = validateDetails(validateProject(JSON.parse(JSON.stringify(s))));
  assert.equal(restored.docs.length, 2);
  assert.equal(restored.docs[0].data, before[0].data);
  assert.deepEqual(restored.docs[1], before[1]);
  assert.equal(restored.docs[0].translationPDF.data, before[1].data);
  assert.equal(restored.docs[0].translationPDF.pages, 41);
  assert.equal(restored.docs[0].translationPDF.translations, undefined);
});

test("rejects mismatched pages and invalid attachments before replacing a valid pair", () => {
  const d = original();
  d.translationPDF = pairedTranslation(d, translated(), "attachment");
  const before = structuredClone(d);
  assert.throws(() => { d.translationPDF = pairedTranslation(d, { ...translated(), pages: 40 }); }, /41 页.*40 页/);
  assert.throws(() => pairedTranslation(d, { ...translated(), data: "invalid PDF!" }), /数据无效/);
  assert.throws(() => pairedTranslation({ ...d, type: "text" }, translated()), /都需要是 PDF/);
  assert.deepEqual(d, before);
});

test("project validation rejects missing and colliding attachment IDs", () => {
  const s = project();
  s.docs[0].translationPDF = { ...translated() };
  assert.throws(() => validateDetails(s), /ID 重复/);
  delete s.docs[0].translationPDF.id;
  assert.throws(() => validateDetails(s), /ID 无效/);
});

test("Chinese excerpts keep their actual provenance after replacement or unpairing", () => {
  const s = project();
  const source = { docId: "english", page: 3, side: "zh", text: "原始中文引文", translationPDFId: "old-attachment", translationPDFName: "旧版中文译本", rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.1 }] };
  s.nodes.push({ id: "note", title: "摘录", text: source.text, kind: "quote", x: 0, y: 0, source });
  const restored = validateDetails(validateProject(JSON.parse(JSON.stringify(s))));
  const context = contextText(restored, restored.nodes);
  assert.match(context, /中文译本摘录/);
  assert.match(context, /旧版中文译本/);
  assert.match(context, /第 3 页/);
  assert.match(context, /未建立逐句对齐/);
  assert.match(context, /原始中文引文/);
  assert.match(markdown(restored, restored.nodes), /旧版中文译本/);
});
