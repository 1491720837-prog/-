// Sizes are supplied by the renderer so wrapped titles and resized cards count.
export function mindmapLayout(nodes, sizeOf, { gapX = 110, gapY = 48, rootGap = 90 } = {}) {
  if (!nodes.length) return new Map();
  const children = new Map(nodes.map(n => [n.id, []]));
  const roots = [];
  for (const n of nodes) (children.get(n.parentId) || roots).push(n);
  const sort = list => list.sort((a, b) => a.y - b.y || a.x - b.x);
  sort(roots);
  for (const list of children.values()) sort(list);
  const order = [], stack = [...roots];
  while (stack.length) { const n = stack.pop(); order.push(n); stack.push(...children.get(n.id)); }
  const sizes = new Map(nodes.map(n => [n.id, sizeOf(n)])), spans = new Map();
  for (const n of order.reverse()) {
    const kids = children.get(n.id);
    spans.set(n.id, Math.max(sizes.get(n.id).height, kids.reduce((sum, c) => sum + spans.get(c.id), 0) + Math.max(0, kids.length - 1) * gapY));
  }
  const positions = new Map(), left = Math.min(...roots.map(n => n.x));
  let top = Math.min(...nodes.map(n => n.y));
  const pending = [];
  for (const root of roots) { pending.push({ node: root, x: left, y: top }); top += spans.get(root.id) + rootGap; }
  while (pending.length) {
    const { node, x, y } = pending.pop(), size = sizes.get(node.id), kids = children.get(node.id);
    positions.set(node.id, { x, y: y + (spans.get(node.id) - size.height) / 2 });
    const total = kids.reduce((sum, c) => sum + spans.get(c.id), 0) + Math.max(0, kids.length - 1) * gapY;
    let childY = y + (spans.get(node.id) - total) / 2;
    for (const child of kids) { pending.push({ node: child, x: x + size.width + gapX, y: childY }); childY += spans.get(child.id) + gapY; }
  }
  return positions;
}

export function nextNodePosition(nodes, parentId, sizeOf, newSize = { width: 262, height: 160 }) {
  if (!nodes.length) return { x: 45, y: 70 };
  const parent = nodes.find(n => n.id === parentId);
  const bottom = n => n.y + sizeOf(n).height;
  if (!parent) return {
    x: Math.min(...nodes.filter(n => !n.parentId).map(n => n.x)),
    y: Math.max(...nodes.map(bottom)) + 90,
  };
  const x = parent.x + sizeOf(parent).width + 110;
  let y = parent.y;
  // Avoid complete card bounds, including manually enlarged notes.
  const obstacles = nodes.filter(n => n.x < x + newSize.width + 40 && n.x + sizeOf(n).width + 40 > x).sort((a, b) => a.y - b.y);
  for (const n of obstacles) if (y < bottom(n) + 48 && y + newSize.height + 48 > n.y) y = bottom(n) + 48;
  return { x, y };
}
