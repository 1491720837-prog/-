import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestors,
  descendants,
  setParent,
  appearance,
  visibleNodes,
  scopeNodes,
  contextText,
  validateProject,
  validateDetails,
} from "../dist/model.js";
const nodes = () =>
  Array.from({ length: 30 }, (_, i) => ({
    id: "n" + i,
    parentId: i ? "n" + (i - 1) : null,
    x: 0,
    y: i * 180,
    text: "内容" + i,
    title: "标题" + i,
    kind: i === 3 ? "ai" : "note",
    prompt: i === 3 ? "原问题" : "",
  }));
test("supports deep hierarchy without a three-level limit", () => {
  const n = nodes();
  assert.equal(ancestors(n, "n29").length, 30);
  assert.equal(descendants(n, "n0").length, 29);
  assert.equal(appearance(n, [], n[29]).label, "L30");
});
test("rejects cycles and allows reparenting", () => {
  const n = nodes();
  assert.throws(() => setParent(n, "n0", "n20"), /下级/);
  setParent(n, "n20", null);
  assert.equal(ancestors(n, "n29").length, 10);
});
test("isolated color and hierarchy colors depend on actual graph", () => {
  const n = nodes();
  const detached = { id: "solo", parentId: null };
  n.push(detached);
  assert.equal(appearance(n, [], detached).label, "独立");
  assert.notEqual(appearance(n, [], n[0]).label, "独立");
  assert.equal(
    appearance(n, [], n[1]).color,
    appearance([...n, { id: "sibling", parentId: "n0" }], [], {
      id: "sibling",
      parentId: "n0",
    }).color,
  );
});
test("collapse hides descendants without losing content", () => {
  const n = nodes();
  n[2].collapsed = true;
  assert.equal(visibleNodes(n).length, 3);
  assert.equal(scopeNodes({ nodes: n }, "branch", new Set(["n0"])).length, 30);
});
test("context keeps provenance and AI/user distinctions", () => {
  const s = {
    title: "测试",
    docs: [{ id: "d", name: "Paper" }],
    nodes: nodes(),
    edges: [{ from: "n3", to: "n5", label: "支持" }],
  };
  s.nodes[3].source = {
    docId: "d",
    page: 2,
    text: "Actual evidence",
    translation: "实际证据",
    rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.04 }],
  };
  const t = contextText(s, [s.nodes[3]], {
    sources: true,
    translation: true,
    history: true,
  });
  assert.match(t, /AI 回答/);
  assert.match(t, /Actual evidence/);
  assert.match(t, /第 2 页/);
  assert.match(t, /原问题/);
  assert.match(t, /本次未包含/);
  assert.match(t, /实际证据/);
});
test("import validation rejects corrupted graph and image URLs", () => {
  const s = { version: 1, docs: [], nodes: nodes(), edges: [] };
  assert.equal(validateProject(s), s);
  s.nodes[0].image = "javascript:alert(1)";
  assert.throws(() => validateProject(s), /图片/);
  delete s.nodes[0].image;
  s.nodes[0].parentId = "missing";
  assert.throws(() => validateProject(s), /父节点/);
});
test("project round trips preserve manual dimensions and content fitting, including older nodes", () => {
  const s = { version: 1, title: "尺寸验证", docs: [], nodes: nodes(), edges: [] };
  Object.assign(s.nodes[0], { width: 362, height: 508 });
  Object.assign(s.nodes[1], { width: 460, fitContent: true });
  const restored = validateDetails(validateProject(JSON.parse(JSON.stringify(s))));
  assert.equal(restored.nodes[0].height, 508);
  assert.equal(restored.nodes[0].width, 362);
  assert.equal(restored.nodes[1].fitContent, true);
  assert.equal(restored.nodes[2].height, undefined);
  for (const height of [0, 117, 2001, NaN, Infinity, "508"]) {
    s.nodes[0].height = height;
    assert.throws(() => validateDetails(s), /高度/);
  }
  s.nodes[0].height = 508;
  s.nodes[1].fitContent = "true";
  assert.throws(() => validateDetails(s), /自适应/);
});
test("AI evidence survives export and rejects malformed imported records", () => {
  const s = {version:1,title:"阅读记录",docs:[],nodes:nodes(),edges:[]};
  const page = {docId:"paper",name:"Paper",page:6,side:"en"};
  const evidence = {provider:"codex",model:"default",reasoningEffort:"medium",attached:[page],sources:[page],warnings:[],trace:[{tool:"read_document_page",arguments:{docId:"paper",page:6,side:"en"},result:{text:"Evidence"}}]};
  s.nodes[0].aiEvidence=evidence;
  assert.deepEqual(validateDetails(validateProject(JSON.parse(JSON.stringify(s)))).nodes[0].aiEvidence,evidence);
  for (const invalid of [null,{...evidence,attached:{}},{...evidence,warnings:[null]},{...evidence,sources:[{...page,page:0}]}]) {
    s.nodes[0].aiEvidence=invalid;
    assert.throws(()=>validateDetails(s),/参考记录/);
  }
});
