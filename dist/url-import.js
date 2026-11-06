// Extracts an article from an already-fetched HTML document.
// Mirrors browser-extension/capture.js, minus the checks that need layout
// (getClientRects, naturalWidth), because the document is not rendered here.
const SKIP = 'nav,header,footer,aside,script,style,noscript,form,[hidden],[aria-hidden="true"],.comments-container,#js_cmt_area';
const ROOTS = ['#js_content', '.note-detail-mask .note-scroller', 'article', 'main', '[role="main"]'];

export function extractDocument(doc, href) {
  if (!doc?.querySelector) throw Error('页面内容无法解析');
  const root = ROOTS.map((selector) => doc.querySelector(selector)).find(Boolean) || doc.body;
  if (!root) throw Error('页面没有正文内容');
  const seen = new Set();
  const blocks = [];
  let total = 0;
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,img')) {
    if (el.closest(SKIP)) continue;
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('src');
      if (!src || seen.has(src)) continue;
      let absolute;
      try {
        absolute = new URL(src, href);
      } catch {
        continue;
      }
      if (!['http:', 'https:'].includes(absolute.protocol)) continue;
      blocks.push({ type: 'image', url: absolute.href, alt: el.getAttribute('alt') || '' });
      seen.add(src);
      continue;
    }
    // Nested list/blockquote paragraphs would duplicate their parent text.
    if (el.querySelector('p,li,blockquote,pre')) continue;
    const text = el.textContent?.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (!text) continue;
    total += text.length;
    if (total > 1_000_000 || blocks.length >= 2000) throw Error('文章太长，请改用浏览器扩展只采集需要的部分');
    blocks.push({ type: 'text', text });
  }
  if (!blocks.some((b) => b.type === 'text')) {
    const text = (root.textContent || '').replace(/[ \t\u00a0]+/g, ' ').trim();
    if (text) blocks.unshift({ type: 'text', text });
  }
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
  if (text.length < 10) throw Error('没有找到正文；该页面可能需要登录，或正文由脚本动态加载');
  const meta = (name) =>
    doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
    '';
  const title = (
    doc.querySelector('#activity-name')?.textContent ||
    meta('og:title') ||
    doc.querySelector('title')?.textContent ||
    ''
  ).trim();
  return {
    title: title || '未命名文章',
    url: href,
    author: (meta('author') || doc.querySelector('#js_name')?.textContent || '').trim(),
    text,
    blocks,
    selection: false,
  };
}
