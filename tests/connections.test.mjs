import test from "node:test";
import assert from "node:assert/strict";
import { connectionFromPort, planConnection, planDisconnect, endpointGrip, connectionCurve } from "../dist/connections.js";
import { validateProject, validateDetails, contextText, markdown } from "../dist/model.js";

const graph = () => ({ version: 1, title: "连接测试", docs: [], edges: [], nodes: ["a", "b", "c"].map((id, i) => ({ id, title: id, text: "笔记", kind: "note", x: i * 320, y: i * 200, parentId: null })) });
const apply = (state, request, previous) => Object.assign(state, planConnection(state, request, previous));

test("right and left ports create hierarchy, top and bottom create associations", () => {
  const s = graph();
  apply(s, connectionFromPort("a", "b", "right"));
  assert.equal(s.nodes[1].parentId, "a");
  assert.equal(s.nodes[1].parentLabel, "父子");
  apply(s, connectionFromPort("a", "c", "left"));
  assert.equal(s.nodes[0].parentId, "c");
  apply(s, connectionFromPort("b", "c", "top", "bottom"));
  assert.deepEqual([s.edges[0].fromPort, s.edges[0].toPort, s.edges[0].label], ["top", "bottom", "关联"]);
  assert.equal(s.nodes[1].parentId, "a");
  assert.ok(s.nodes.every((n) => n.text === "笔记"));
  assert.equal(planConnection(s, connectionFromPort("a", "b", "right")), null);
  assert.equal(planConnection(s, connectionFromPort("b", "c", "bottom")), null);
  assert.equal(validateDetails(validateProject(JSON.parse(JSON.stringify(s)))).edges[0].fromPort, "top");
});

test("changing type or reversing direction updates one connection and preserves descendants", () => {
  const s = graph();
  apply(s, { from: "a", to: "b", type: "parent" });
  apply(s, { from: "b", to: "c", type: "parent" });
  apply(s, { from: "a", to: "b", type: "relation", label: "支持" }, { type: "parent", from: "a", to: "b" });
  assert.equal(s.nodes[1].parentId, null);
  assert.equal(s.nodes[2].parentId, "b");
  assert.equal(s.edges.length, 1);
  const id = s.edges[0].id;
  apply(s, { from: "b", to: "a", type: "parent", label: "包含" }, { type: "relation", id });
  assert.equal(s.edges.length, 0);
  assert.equal(s.nodes[0].parentId, "b");
  assert.equal(s.nodes[0].parentLabel, "包含");
  assert.equal(s.nodes[2].parentId, "b");
});

test("invalid conversions are atomic and cannot create cyclic hierarchies", () => {
  const s = graph();
  apply(s, { from: "c", to: "a", type: "parent" });
  apply(s, { from: "a", to: "b", type: "parent" });
  apply(s, { from: "b", to: "c", type: "relation" });
  const before = JSON.stringify(s);
  assert.throws(() => planConnection(s, { from: "b", to: "c", type: "parent" }, { type: "relation", id: s.edges[0].id }), /下级/);
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => planConnection(s, connectionFromPort("a", "a", "bottom")), /自身/);
});

test("relation metadata survives project restore and is included in AI context and Markdown", () => {
  const s = graph();
  apply(s, { from: "a", to: "b", type: "parent", label: "研究方法" });
  apply(s, { from: "b", to: "c", type: "relation", label: "证据", fromPort: "left", toPort: "right" });
  const restored = validateDetails(validateProject(JSON.parse(JSON.stringify(s))));
  assert.match(contextText(restored, restored.nodes), /关系：研究方法/);
  assert.match(markdown(restored, restored.nodes), /与父节点的关系：研究方法/);
  assert.equal(restored.edges[0].fromPort, "left");
  restored.edges[0].fromPort = "invalid";
  assert.throws(() => validateDetails(restored), /关联属性/);
});

test("curves attach to the chosen ports and place labels on the actual curve", () => {
  const a = { x: 300, y: 20, width: 200, height: 160 }, b = { x: 0, y: 280, width: 200, height: 220 };
  const side = connectionCurve(a, b, { type: "relation", fromPort: "left", toPort: "right" });
  assert.deepEqual(side.start, { x: 300, y: 100 });
  assert.deepEqual(side.end, { x: 200, y: 390 });
  assert.ok(side.control1.x < side.start.x && side.control2.x > side.end.x);
  const parent = connectionCurve(a, b, { type: "parent" });
  assert.deepEqual(parent.start, { x: 500, y: 100 });
  assert.deepEqual(parent.end, { x: 0, y: 390 });
  assert.deepEqual(parent.label, { x: 250, y: 245 });
  const vertical = connectionCurve(a, b, { type: "relation", fromPort: "bottom", toPort: "top" });
  assert.deepEqual(vertical.start, { x: 400, y: 180 });
  assert.deepEqual(vertical.end, { x: 100, y: 280 });
  assert.ok(vertical.control1.y > vertical.start.y && vertical.control2.y < vertical.end.y);
});

test("disconnecting a parent preserves descendants, notes and other connections", () => {
  const s = graph();
  apply(s, { from: "a", to: "b", type: "parent", label: "研究方法" });
  apply(s, { from: "b", to: "c", type: "parent" });
  apply(s, { from: "a", to: "c", type: "relation", label: "支持" });
  const before = JSON.stringify(s);
  const plan = planDisconnect(s, { type: "parent", from: "a", to: "b" });
  assert.equal(JSON.stringify(s), before);
  assert.equal(plan.nodes[1].parentId, null);
  assert.equal(plan.nodes[1].parentLabel, undefined);
  assert.equal(plan.nodes[2].parentId, "b");
  assert.deepEqual(plan.edges, s.edges);
  assert.deepEqual(plan.nodes.map((n) => n.text), s.nodes.map((n) => n.text));
  assert.equal(planDisconnect(s, { type: "parent", from: "c", to: "b" }), null);
});

test("disconnecting one of several relations removes only that exact connection", () => {
  const s = graph();
  apply(s, { from: "a", to: "b", type: "relation" });
  apply(s, { from: "a", to: "c", type: "relation" });
  const edge = s.edges[0];
  const plan = planDisconnect(s, { ...edge, type: "relation" });
  assert.deepEqual(plan.edges, [s.edges[1]]);
  assert.deepEqual(plan.nodes, s.nodes);
  assert.equal(s.edges.length, 2);
  assert.equal(planDisconnect(s, { ...edge, to: "c", type: "relation" }), null);
  assert.equal(planDisconnect(s, { ...edge, id: "missing", type: "relation" }), null);
});

test("endpoint grips follow the curve outside the node rather than sharing its port", () => {
  const curve = connectionCurve({x:0,y:0,width:200,height:100}, {x:300,y:300,width:200,height:100}, {type:"parent"});
  const start = endpointGrip(curve, "from", 20), end = endpointGrip(curve, "to", 20);
  assert.ok(Math.hypot(start.x - curve.start.x, start.y - curve.start.y) >= 20);
  assert.ok(Math.hypot(end.x - curve.end.x, end.y - curve.end.y) >= 20);
  assert.ok(start.x > curve.start.x && end.x < curve.end.x);
});
