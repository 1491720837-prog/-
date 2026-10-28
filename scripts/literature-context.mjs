export function validateCorpus(input = []) {
  if (!Array.isArray(input) || input.length > 3000) throw new Error('文献页数超出单次读取范围');
  let total = 0; const seen = new Set();
  return input.map(p => {
    if (!p || typeof p.docId !== 'string' || p.docId.length > 128 || typeof p.name !== 'string' || p.name.length > 1000 ||
        !Number.isInteger(p.page) || p.page < 1 || !['en','zh'].includes(p.side) || typeof p.text !== 'string' || p.text.length > 100000)
      throw new Error('文献页面数据无效');
    total += p.text.length;
    if (total > 8_000_000) throw new Error('文献文字过多，请缩小本次上下文范围');
    const key = `${p.docId}:${p.side}:${p.page}`;
    if (seen.has(key)) throw new Error('文献页码重复');
    seen.add(key);
    return { docId:p.docId, name:p.name, page:p.page, side:p.side, text:p.text };
  });
}
export function pageLabel(p) { return `${p.name} · ${p.side === 'zh' ? '中文' : '原文'} · 第 ${p.page} 页`; }
export function searchPages(pages, { query, docId, side, limit = 6 } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('请输入有效的文献检索词');
  const q = query.toLowerCase().trim();
  const words = [...new Set(q.match(/[a-z0-9][a-z0-9_-]+|[\u3400-\u9fff]{2,}/g) || [q])];
  const tokens = [...new Set(words.flatMap(w => /[\u3400-\u9fff]/.test(w) && w.length > 3 ? [w,...Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2))] : [w]))];
  return pages.filter(p => (!docId || p.docId === docId) && (!side || p.side === side)).map(p => {
    const text = p.text.toLowerCase(); let score = text.includes(q) ? 20 : 0, first = text.indexOf(q);
    for (const token of tokens) { const index=text.indexOf(token); if(index >= 0) {score += token.length; if(first<0)first=index;} }
    const start=Math.max(0,first-180);
    return {p,score,start};
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score || a.p.page-b.p.page).slice(0,Math.max(1,Math.min(8,Number(limit)||6))).map(({p,start})=>({docId:p.docId,name:p.name,page:p.page,side:p.side,label:pageLabel(p),snippet:p.text.slice(start,start+1200),offset:start}));
}
export function readPage(pages, {docId,side,page,offset=0}={}) {
  const p=pages.find(p=>p.docId===docId && p.side===side && p.page===page);
  if(!p)throw new Error('本次上下文中没有这一页');
  if(!Number.isInteger(offset)||offset<0||offset>p.text.length)throw new Error('页面文字偏移无效');
  const end=Math.min(p.text.length,offset+16000);
  return {...p,label:pageLabel(p),text:p.text.slice(offset,end),nextOffset:end<p.text.length?end:null,totalCharacters:p.text.length};
}
export function manifest(pages) {
  const docs=new Map();
  for(const p of pages) {const key=p.docId+':'+p.side;if(!docs.has(key))docs.set(key,{docId:p.docId,name:p.name,side:p.side,pages:[]});docs.get(key).pages.push(p.page);}
  return [...docs.values()].map(d=>({...d,emptyPages:d.pages.filter(page=>!pages.find(p=>p.docId===d.docId&&p.side===d.side&&p.page===page).text.trim())}));
}
export const literatureTools = [
  {type:'function',name:'search_document',description:'检索本次提供的文献全文。可用中英文关键词；返回匹配片段和真实 PDF 页码。需要完整上下文时继续读取该页。',inputSchema:{type:'object',properties:{query:{type:'string'},docId:{type:'string'},side:{type:'string',enum:['en','zh']},limit:{type:'integer'}},required:['query'],additionalProperties:false}},
  {type:'function',name:'read_document_page',description:'读取指定文献的原文或中文 PDF 页面文字。页码是 PDF 页序号。nextOffset 非空时可以继续读取余下文字。',inputSchema:{type:'object',properties:{docId:{type:'string'},side:{type:'string',enum:['en','zh']},page:{type:'integer'},offset:{type:'integer'}},required:['docId','side','page'],additionalProperties:false}},
];
