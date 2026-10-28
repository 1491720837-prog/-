// Shared deterministic projection: never includes credentials, viewport, or hidden AI context.
import {safeWebURL,contentSourceLabel} from './content-source.js';
export const xmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=s=>xmlEscape(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>');
export function prose(text='') {
 const lines=String(text).split('\n'),out=[];
 for(let i=0;i<lines.length;i++){
  const l=lines[i];if(!l.trim())continue;
  if(l.includes('|')&&/^\s*\|?\s*:?-+/.test(lines[i+1]||'')){
   const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());
   const header=cells(l);i+=2;const rows=[];
   for(;i<lines.length&&lines[i].includes('|');i++)rows.push(cells(lines[i]));i--;
   out.push('<table><thead><tr>'+header.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+header.map((_,j)=>'<td>'+inline(r[j]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
  }else if(/^#{1,6}\s/.test(l))out.push('<p><b>'+inline(l.replace(/^#+\s+/,''))+'</b></p>');
  else if(/^\s*\d+[.)]\s/.test(l))out.push('<ol><li seq="auto">'+inline(l.replace(/^\s*\d+[.)]\s+/,''))+'</li></ol>');
  else if(/^\s*[-*]\s/.test(l))out.push('<ul><li>'+inline(l.replace(/^\s*[-*]\s+/,''))+'</li></ul>');
  else if(/^>\s?/.test(l))out.push('<blockquote><p>'+inline(l.replace(/^>\s?/,''))+'</p></blockquote>');
  else out.push('<p>'+inline(l)+'</p>');
 }
 return out.join('\n');
}
export function projectSnapshot(s){
 const docs=(s.docs||[]).map(d=>({id:d.id,name:d.name,type:d.type,...(d.contentKind?{contentKind:d.contentKind,provenance:{sourceUrl:d.provenance?.sourceUrl,minuteUrl:d.provenance?.minuteUrl}}:{}),data:d.type==='pdf'?d.data:undefined,translationPDF:d.translationPDF?{id:d.translationPDF.id,name:d.translationPDF.name,data:d.translationPDF.data}:undefined}));
 const by=new Map(s.nodes.map(n=>[n.id,n])),ordered=[],seen=new Set();
 const sort=ns=>ns.slice().sort((a,b)=>(a.y||0)-(b.y||0)||(a.x||0)-(b.x||0)||a.id.localeCompare(b.id));
 function visit(n,path){if(seen.has(n.id))throw Error('节点层级中存在循环');seen.add(n.id);ordered.push({id:n.id,title:n.title,text:n.text||'',prompt:n.prompt||'',image:n.image||'',kind:n.kind,parentId:n.parentId||null,parentLabel:n.parentLabel||'父子',path,source:n.source?{docId:n.source.docId,page:n.source.page,text:n.source.text,translationPDFId:n.source.translationPDFId}:null});sort(s.nodes.filter(c=>c.parentId===n.id)).forEach((c,i)=>visit(c,[...path,i+1]));}
 sort(s.nodes.filter(n=>!by.has(n.parentId))).forEach((n,i)=>visit(n,[i+1]));
 if(seen.size!==s.nodes.length)throw Error('节点层级中存在循环或重复');
 return {projectId:s.projectId,title:s.title,nodes:ordered,edges:(s.edges||[]).map(e=>({from:e.from,to:e.to,label:e.label||'关联'})),docs};
}
export function renderProject(s,links={}){
 const out=['<p>与 Folio 工作台双向同步。可在此编辑已有节点的标题和正文；同一字段的冲突会提示选择版本。</p>','<p><a href="http://127.0.0.1:4318/">打开本机 Folio 工作台</a></p>'];
 for(const d of s.docs)if(d.contentKind){for(const [label,url] of [['原始来源',d.provenance?.sourceUrl],['飞书逐字稿',d.provenance?.minuteUrl]])if(safeWebURL(url))out.push(`<p>${xmlEscape(d.name)} · <a href="${xmlEscape(url)}">${label}</a></p>`);}
 const linked=new Set();for(const d of s.docs){const files=[[/中文|译本|翻译/.test(d.name)?'中文文献':'英文原文',d.id],['中文译本',d.translationPDF?.id]];for(const [label,id] of files)if(links[id]&&!linked.has(links[id])){linked.add(links[id]);out.push(`<p>${xmlEscape(d.name)} · <a href="${xmlEscape(links[id])}">${label} PDF</a></p>`);}}
 const by=new Map(s.nodes.map(n=>[n.id,n]));
 for(const n of s.nodes){
  const h=Math.min(n.path.length,9),number=n.path.join('.');out.push(`<h${h}>${xmlEscape(n.title||'未命名节点')}</h${h}>`);
  if(n.prompt)out.push('<p><b>原始问题：</b>'+inline(n.prompt)+'</p>');
  if(n.image)out.push(`<p>FOLIO_IMAGE_${xmlEscape(n.id)}</p>`);
  out.push(prose(n.text));
  if(n.source){const d=s.docs.find(d=>d.id===n.source.docId),id=n.source.translationPDFId||d?.id,label=contentSourceLabel(d,n.source)||`${d?.name||'文献'} · ${n.source.translationPDFId?'中文译本':'原文'}第 ${Number(n.source.page)||1} 页`,url=links[id]||safeWebURL(d?.provenance?.minuteUrl)||safeWebURL(d?.provenance?.sourceUrl);out.push(`<blockquote><p>出处：${xmlEscape(label)}${url?` · <a href="${xmlEscape(url)}">${d?.contentKind?'打开来源':'打开文献'}</a>`:''}</p>`);if(n.source.text&&n.source.text!==n.text)out.push('<p>'+inline(n.source.text)+'</p>');out.push('</blockquote>');}
 }
 if(!s.nodes.length)out.push('<p>此项目暂无节点；在工作台添加后会自动更新到这里。</p>');
 if(s.edges.length){out.push('<h1>节点关联</h1>');for(const e of s.edges)if(by.has(e.from)&&by.has(e.to))out.push(`<p>${xmlEscape(by.get(e.from).title)} → ${xmlEscape(e.label)} → ${xmlEscape(by.get(e.to).title)}</p>`);}
 return out.join('\n');
}
// DocxXML top-level blocks, including nested tables without deleting their children separately.
export function topBlocks(xml){
 const out=[];let depth=0,start=0,tag='',id='';
 for(const m of xml.matchAll(/<\/?([\w-]+)\b[^>]*>/g)){
  if(['ol','ul'].includes(m[1]))continue;
  const closing=m[0].startsWith('</'),self=m[0].endsWith('/>')||['img','source','br','hr'].includes(m[1]);
  if(!closing){if(depth===0){start=m.index;tag=m[1];id=m[0].match(/\bid="([^"]+)"/)?.[1]||'';}if(!self)depth++;}
  else depth--;
  if(depth===0&&id&&tag!=='title')out.push({id,tag,xml:xml.slice(start,m.index+m[0].length)});
 }
 return out;
}
