// Keep page geometry independent of rendered canvases, so scrolling and paired
// navigation remain stable while distant pages are unloaded.
export function pageLayout(sizes, width, gap = 28) {
  let top = 0;
  return sizes.map(({ width: w, height: h }, i) => {
    const height = width * h / w;
    const item = { page: i + 1, top, height };
    top += height + gap;
    return item;
  });
}
export function pageAtOffset(layout, offset) {
  let lo = 0, hi = layout.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (layout[mid].top <= offset) lo = mid;
    else hi = mid - 1;
  }
  const item = layout[lo];
  return { page: item.page, fraction: Math.max(0, Math.min(1, (offset - item.top) / item.height)) };
}
export function offsetForPage(layout, { page, fraction = 0 }) {
  const item = layout[Math.max(0, Math.min(layout.length - 1, Math.floor(page) - 1))];
  return item.top + Math.max(0, Math.min(1, fraction)) * item.height;
}
export function inkBounds(pixels, width, height) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (pixels[i + 3] > 128 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 246) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return { x: 0, y: 0, w: 1, h: 1 };
  const pad = Math.max(3, width * 0.025);
  left = Math.max(0, left - pad); right = Math.min(width, right + pad + 1);
  top = Math.max(0, top - pad); bottom = Math.min(height, bottom + pad + 1);
  // Sparse pages should not become disproportionately magnified.
  if (right - left < width * 0.65) {
    left = Math.max(0, Math.min(width * 0.35, (left + right - width * 0.65) / 2));
    right = left + width * 0.65;
  }
  return { x: left / width, y: top / height, w: (right - left) / width, h: (bottom - top) / height };
}

export class PageStack {
  constructor({ host, scroll, sizes, boxes, render, onMount }) {
    this.host = host;
    this.scroll = scroll;
    this.render = render;
    this.onMount = onMount;
    this.width = Math.max(260, host.clientWidth || 360);
    this.boxes = boxes || sizes.map(() => ({ x: 0, y: 0, w: 1, h: 1 }));
    this.sizes = sizes;
    this.layout = pageLayout(sizes.map((s, i) => ({ width: s.width * this.boxes[i].w, height: s.height * this.boxes[i].h })), this.width);
    this.queue = [];
    this.running = 0;
    this.wanted = new Set();
    this.disposed = false;
    host.classList.add("continuous-pages");
    const fragment = document.createDocumentFragment();
    this.records = this.layout.map(({ page, height }) => {
      const slot = document.createElement("div");
      slot.className = "pdf-page-slot";
      slot.dataset.page = page;
      slot.style.width = this.width + "px";
      slot.style.height = height + "px";
      const content = document.createElement("div");
      content.className = "pdf-page-content";
      content.dataset.renderWidth = this.width;
      const label = document.createElement("div");
      label.className = "pdf-page-label";
      label.textContent = `第 ${page} / ${sizes.length} 页`;
      slot.append(content, label);
      fragment.append(slot);
      const record = { page, slot, content, data: null, promise: null, error: false };
      this.placeholder(record);
      return record;
    });
    host.replaceChildren(fragment);
  }
  top() {
    return this.host.getBoundingClientRect().top - this.scroll.getBoundingClientRect().top + this.scroll.scrollTop;
  }
  anchor() { return Math.min(180, this.scroll.clientHeight * 0.35); }
  position() {
    const position = pageAtOffset(this.layout, this.scroll.scrollTop - this.top() + this.anchor());
    const max = this.scroll.scrollHeight - this.scroll.clientHeight;
    if (max > 0 && this.scroll.scrollTop >= max - 1 && position.page < this.records.length)
      return { page: this.records.length, fraction: 0, documentY: this.boxes.at(-1).y };
    const box = this.boxes[position.page - 1];
    return { ...position, documentY: box.y + position.fraction * box.h };
  }
  scrollTo(position, anchor = this.anchor()) {
    const box = this.boxes[position.page - 1];
    const mapped = position.documentY === undefined ? position : { ...position, fraction: (position.documentY - box.y) / box.h };
    this.scroll.scrollTop = Math.max(0, this.top() + offsetForPage(this.layout, mapped) - anchor);
    this.refresh();
  }
  get(page) { return this.records[page - 1]?.data; }
  placeholder(record) {
    record.content.textContent = `第 ${record.page} 页 · 滚动到此处加载`;
    record.content.classList.add("page-loading");
  }
  release(record) {
    if (record.data) {
      for (const canvas of record.data.sheet.querySelectorAll("canvas")) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    record.data = null;
    record.error = false;
    this.placeholder(record);
  }
  refresh() {
    if (this.disposed) return;
    const top = this.scroll.scrollTop - this.top();
    const first = pageAtOffset(this.layout, top).page;
    const last = pageAtOffset(this.layout, top + this.scroll.clientHeight).page;
    const start = Math.max(1, first - 1), end = Math.min(this.records.length, last + 1);
    this.wanted = new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    const selection = getSelection();
    for (const record of this.records) {
      if (record.data && (record.page < start - 1 || record.page > end + 1) &&
          !record.slot.contains(selection?.anchorNode) && !record.slot.querySelector(".crop-overlay"))
        this.release(record);
    }
    // Visible pages take priority over the one-page lookahead.
    for (let p = first; p <= last; p++) this.ensure(p);
    for (const p of this.wanted) this.ensure(p);
  }
  ensure(page, force = false) {
    const record = this.records[page - 1];
    if (!record || this.disposed) return Promise.resolve(null);
    if (record.data || record.error) return Promise.resolve(record.data);
    if (force) record.force = true;
    if (record.promise) return record.promise;
    const promise = record.promise = new Promise((resolve) => { record.resolve = resolve; });
    this.queue.push(record);
    this.pump();
    return promise;
  }
  pump() {
    while (!this.disposed && this.running < 2 && this.queue.length) {
      const record = this.queue.shift();
      if (!this.wanted.has(record.page) && !record.force) {
        record.resolve(null);
        record.promise = null;
        continue;
      }
      this.running++;
      record.content.textContent = `正在加载第 ${record.page} 页…`;
      const stage = document.createElement("div");
      const box = this.boxes[record.page - 1];
      stage.dataset.renderWidth = this.width / box.w;
      Promise.resolve().then(() => this.render(record.page, stage)).then((data) => {
        if (this.disposed || (!this.wanted.has(record.page) && !record.force)) {
          for (const c of data.sheet.querySelectorAll("canvas")) c.width = c.height = 0;
          return;
        }
        record.data = data;
        if (data.sheet.classList.contains("pdf-sheet")) {
          Object.assign(data.sheet.style, {
            position: "absolute", left: -box.x * this.width / box.w + "px",
            top: -box.y * this.width / box.w * this.sizes[record.page - 1].height / this.sizes[record.page - 1].width + "px",
          });
        }
        record.content.classList.remove("page-loading");
        record.content.replaceChildren(data.sheet);
        this.onMount?.(record.page, data);
      }).catch((error) => {
        if (this.disposed) return;
        record.error = true;
        record.content.textContent = `第 ${record.page} 页加载失败：${error.message} `;
        const retry = document.createElement("button");
        retry.className = "small-button";
        retry.textContent = "重试";
        retry.onclick = () => { record.error = false; this.ensure(record.page, true); };
        record.content.append(retry);
      }).finally(() => {
        record.resolve(record.data);
        record.promise = null;
        record.force = false;
        this.running--;
        this.pump();
      });
    }
  }
  async invalidate(page) {
    const record = this.records[page - 1];
    if (!record) return;
    await record.promise;
    if (this.disposed) return;
    this.release(record);
    if (this.wanted.has(page)) await this.ensure(page);
  }
  destroy() {
    this.disposed = true;
    for (const record of this.queue) { record.resolve(null); record.promise = null; }
    this.queue = [];
    for (const record of this.records) if (record.data) this.release(record);
    this.host.classList.remove("continuous-pages");
  }
}
