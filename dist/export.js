import { connectionCurve } from "./connections.js";

export function download(name, data, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const enc = new TextEncoder();
function crc32(bytes) {
  let c = -1;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ -1) >>> 0;
}
export function zip(files) {
  const chunks = [],
    central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = enc.encode(name),
      d = typeof data === "string" ? enc.encode(data) : data,
      c = crc32(d);
    const local = new Uint8Array(30 + n.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint32(14, c, true);
    v.setUint32(18, d.length, true);
    v.setUint32(22, d.length, true);
    v.setUint16(26, n.length, true);
    local.set(n, 30);
    chunks.push(local, d);
    const ce = new Uint8Array(46 + n.length),
      cv = new DataView(ce.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, c, true);
    cv.setUint32(20, d.length, true);
    cv.setUint32(24, d.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    ce.set(n, 46);
    central.push(ce);
    offset += local.length + d.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer),
    size = central.reduce((s, b) => s + b.length, 0);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
export async function canvasImage(state, nodes, appearance) {
  if (!nodes.length) throw new Error("画布还没有节点");
  const minX = Math.min(...nodes.map((n) => n.x)) - 40,
    minY = Math.min(...nodes.map((n) => n.y)) - 70,
    maxX = Math.max(...nodes.map((n) => n.x + (n.width || 262))) + 40,
    maxY =
      Math.max(
        ...nodes.map(
          (n) =>
            n.y +
            (document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`)
              ?.offsetHeight || 200),
        ),
      ) + 40;
  const width = maxX - minX,
    height = maxY - minY,
    scale = Math.min(
      2,
      8000 / Math.max(width, height),
      Math.sqrt(24_000_000 / (width * height)),
    );
  const c = document.createElement("canvas");
  c.width = Math.ceil(width * scale);
  c.height = Math.ceil(height * scale);
  const g = c.getContext("2d");
  g.scale(scale, scale);
  g.translate(-minX, -minY);
  g.fillStyle = "#f5f8f2";
  g.fillRect(minX, minY, width, height);
  g.fillStyle = "#607854";
  g.font = "14px sans-serif";
  g.fillText("页间 FOLIO · " + state.title, minX + 25, minY + 30);
  const by = new Map(nodes.map((n) => [n.id, n]));
  const box = (n) => ({ ...n, width: n.width || 262, height: document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`)?.offsetHeight || 200 });
  const drawConnection = (a, b, relation) => {
    const curve = connectionCurve(box(a), box(b), relation);
    g.setLineDash(relation.type === "relation" ? [5, 4] : []);
    g.beginPath();
    g.moveTo(curve.start.x, curve.start.y);
    g.bezierCurveTo(curve.control1.x, curve.control1.y, curve.control2.x, curve.control2.y, curve.end.x, curve.end.y);
    g.stroke();
    g.setLineDash([]);
    g.save();
    const angle = Math.atan2(curve.end.y - curve.control2.y, curve.end.x - curve.control2.x);
    g.translate(curve.end.x, curve.end.y);
    g.rotate(angle);
    g.fillStyle = "#a4b49a";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, -3); g.lineTo(-7, 3); g.closePath(); g.fill();
    g.restore();
    g.save();
    g.font = "12px sans-serif";
    g.textAlign = "center";
    g.lineWidth = 5;
    g.strokeStyle = "#f5f8f2";
    g.strokeText(relation.label, curve.label.x, curve.label.y - 7);
    g.fillStyle = "#667d5d";
    g.fillText(relation.label, curve.label.x, curve.label.y - 7);
    g.restore();
  };
  g.lineWidth = 1.5;
  g.strokeStyle = "#a4b49a";
  for (const n of nodes) {
    const p = by.get(n.parentId);
    if (p) drawConnection(p, n, { type: "parent", label: n.parentLabel || "父子" });
  }
  for (const e of state.edges) {
    const a = by.get(e.from),
      b = by.get(e.to);
    if (a && b) {
      drawConnection(a, b, { ...e, type: "relation", label: e.label || "关联" });
    }
  }
  for (const n of nodes) {
    const el = document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`),
      h = el?.offsetHeight || 200,
      headerHeight = el?.querySelector(".node-header")?.offsetHeight || 37,
      w = n.width || 262,
      color = appearance(state.nodes, state.edges, n).color;
    g.fillStyle = "#fff";
    g.strokeStyle = color;
    g.beginPath();
    g.roundRect(n.x, n.y, w, h, 8);
    g.fill();
    g.stroke();
    g.save();
    g.beginPath();
    g.rect(n.x + 1, n.y + 1, w - 2, h - 2);
    g.clip();
    g.fillStyle = color + "18";
    g.fillRect(n.x, n.y, w, headerHeight);
    g.fillStyle = "#52654d";
    g.font = "bold 12px sans-serif";
    drawWrapped(g, n.title || "未命名", n.x + 13, n.y + 20, w - 29, 18, n.y + headerHeight - 4);
    let y = n.y + headerHeight + 19;
    if (n.image) {
      const im = new Image();
      im.src = n.image;
      await im.decode();
      const ratio = Math.min((w - 32) / im.width, n.height || n.fitContent ? Infinity : 220 / im.height);
      const ih = im.height * ratio;
      g.drawImage(im, n.x + 15, y, im.width * ratio, ih);
      y += ih + 18;
    }
    if (n.prompt) {
      g.fillStyle = "#8c997e";
      g.font = "10px sans-serif";
      y =
        drawWrapped(
          g,
          "问题：" + n.prompt,
          n.x + 14,
          y,
          w - 29,
          15,
          h + n.y - 26,
        ) + 10;
    }
    g.fillStyle = "#5a6853";
    g.font = "12px sans-serif";
    drawWrapped(g, n.text, n.x + 14, y, w - 29, 21, h + n.y - 23);
    g.fillStyle = "#9ca68e";
    g.fillRect(n.x + 3, n.y + h - 22, w - 6, 20);
    g.fillStyle = "#fff";
    g.font = "9px sans-serif";
    g.fillText(
      n.source
        ? "第 " +
            n.source.page +
            " 页 · " +
            (state.docs.find((d) => d.id === n.source.docId)?.name || "文献")
        : "个人笔记",
      n.x + 13,
      n.y + h - 8,
      w - 27,
    );
    g.restore();
  }
  return c;
}
function drawWrapped(g, text, x, y, width, lineHeight, maxY) {
  let line = "";
  for (const ch of text) {
    if (ch === "\n" || g.measureText(line + ch).width > width) {
      if (y > maxY) return y;
      g.fillText(line, x, y);
      y += lineHeight;
      line = ch === "\n" ? "" : ch;
    } else line += ch;
  }
  if (y <= maxY) g.fillText(line, x, y);
  return y + lineHeight;
}
