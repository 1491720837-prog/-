import { setParent, uid } from "./model.js";

export function connectionFromPort(from, to, port, targetPort) {
  if (port === "left") return { from: to, to: from, type: "parent" };
  if (port === "right") return { from, to, type: "parent" };
  return {
    from, to, type: "relation", fromPort: port === "top" ? "top" : "bottom",
    toPort: ["top", "bottom"].includes(targetPort) ? targetPort : undefined,
  };
}

// Prepare changes without touching the live graph. A rejected cycle must also
// leave the old connection intact when changing its type or direction.
export function planConnection(state, request, previous = null) {
  const { from, to, type } = request;
  if (from === to) throw new Error("不能连接节点自身");
  if (!state.nodes.some((n) => n.id === from) || !state.nodes.some((n) => n.id === to))
    throw new Error("连接的节点不存在");
  if (!["parent", "relation"].includes(type)) throw new Error("关系类型无效");
  if (!previous && (type === "parent"
    ? state.nodes.some((n) => n.id === to && n.parentId === from)
    : state.edges.some((e) => e.from === from && e.to === to))) return null;

  const nodes = state.nodes.map((n) => ({ ...n }));
  let edges = state.edges.map((e) => ({ ...e }));
  if (previous?.type === "parent") {
    const child = nodes.find((n) => n.id === previous.to);
    if (child?.parentId !== previous.from) throw new Error("这条关系已变化，请重新选择");
    setParent(nodes, child.id, null);
  } else if (previous?.type === "relation") {
    if (!edges.some((e) => e.id === previous.id)) throw new Error("这条关系已不存在");
    edges = edges.filter((e) => e.id !== previous.id);
  }
  const label = request.label?.trim() || (type === "parent" ? "父子" : "关联");
  if (type === "parent") {
    setParent(nodes, to, from);
    nodes.find((n) => n.id === to).parentLabel = label;
    nodes.find((n) => n.id === from).collapsed = false;
  } else {
    const edge = edges.find((e) => e.from === from && e.to === to);
    const fields = {
      from, to, label,
      fromPort: ["left", "right", "top", "bottom"].includes(request.fromPort) ? request.fromPort : undefined,
      toPort: ["left", "right", "top", "bottom"].includes(request.toPort) ? request.toPort : undefined,
    };
    if (edge) Object.assign(edge, fields);
    else edges.push({ id: previous?.type === "relation" ? previous.id : uid(), ...fields });
  }
  return { nodes, edges };
}

export function portPoint(node, port) {
  return {
    x: node.x + (port === "left" ? 0 : port === "right" ? node.width : node.width / 2),
    y: node.y + (port === "top" ? 0 : port === "bottom" ? node.height : node.height / 2),
  };
}
export function planDisconnect(state, reference) {
  const nodes = state.nodes.map((n) => ({ ...n }));
  if (reference.type === "parent") {
    const child = nodes.find((n) => n.id === reference.to);
    if (!child?.parentId || child.parentId !== reference.from) return null;
    setParent(nodes, child.id, null);
    return { nodes, edges: [...state.edges] };
  }
  const edge = state.edges.find((e) => e.id === reference.id);
  if (!edge || edge.from !== reference.from || edge.to !== reference.to) return null;
  return { nodes, edges: state.edges.filter((e) => e.id !== reference.id) };
}

// Put a grip just outside the node port, following the actual curve. Grips
// belong to individual lines, including when several lines share one port.
export function endpointGrip(curve, endpoint, distance) {
  const origin = endpoint === "from" ? curve.start : curve.end;
  for (let i = 1; i <= 50; i++) {
    const t = endpoint === "from" ? i / 100 : 1 - i / 100, u = 1 - t;
    const point = {
      x: u ** 3 * curve.start.x + 3 * u ** 2 * t * curve.control1.x + 3 * u * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
      y: u ** 3 * curve.start.y + 3 * u ** 2 * t * curve.control1.y + 3 * u * t ** 2 * curve.control2.y + t ** 3 * curve.end.y,
    };
    if (Math.hypot(point.x - origin.x, point.y - origin.y) >= distance || i === 50) return point;
  }
}
export function connectionCurve(a, b, connection) {
  const parent = connection.type === "parent";
  const fromPort = parent ? "right" : connection.fromPort || (a.y + a.height / 2 <= b.y + b.height / 2 ? "bottom" : "top");
  const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" };
  const toPort = parent ? "left" : connection.toPort || opposite[fromPort];
  const start = portPoint(a, fromPort), end = portPoint(b, toPort);
  const control = (point, port) => {
    const horizontal = port === "left" || port === "right";
    const distance = Math.max(40, Math.abs(horizontal ? end.x - start.x : end.y - start.y) * 0.5);
    return { x: point.x + (port === "right" ? distance : port === "left" ? -distance : 0),
      y: point.y + (port === "bottom" ? distance : port === "top" ? -distance : 0) };
  };
  const control1 = control(start, fromPort), control2 = control(end, toPort);
  const label = {
    x: (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8,
    y: (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8,
  };
  return { start, end, control1, control2, label,
    path: `M${start.x},${start.y} C${control1.x},${control1.y} ${control2.x},${control2.y} ${end.x},${end.y}` };
}
