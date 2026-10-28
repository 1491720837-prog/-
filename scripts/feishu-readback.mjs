const textKey=b=>['text','heading1','heading2','heading3','heading4','heading5','heading6','heading7','heading8','heading9','bullet','ordered','quote','code','todo'].find(k=>b[k]);
const plain=b=>(b?.[textKey(b)]?.elements||[]).map(e=>e.text_run?.content||e.equation?.content||e.mention_doc?.title||'').join('');
function rich(b){return (b?.[textKey(b)]?.elements||[]).map(e=>{
 if(!e.text_run){if(e.equation)return '$'+e.equation.content+'$';throw Error('节点包含暂不支持回写的富文本元素');}
 let {content:t,text_element_style:s={}}=e.text_run;
 if(s.inline_code)t='`'+t+'`';if(s.bold)t='**'+t+'**';if(s.italic)t='*'+t+'*';if(s.strikethrough)t='~~'+t+'~~';
 if(s.link){let url=s.link.url;try{url=decodeURIComponent(url);}catch{}t='['+t+']('+url+')';}return t;
 }).join('');}
export function projectRemoteFields(items,nodeBlocks){
 const by=new Map(items.map(b=>[b.block_id,b])),titles=new Set(Object.values(nodeBlocks)),fields={},protectedBlocks=[];
 const serialize=(id,depth=0)=>{const b=by.get(id);if(!b)throw Error('飞书段落缺失');if(titles.has(id))return '';
  if(b.block_type===27){protectedBlocks.push({id,image:b.image?.token});return '';}
  if(b.block_type===34)return (b.children||[]).map(c=>serialize(c,depth)).filter(Boolean).map(t=>'> '+t.replace(/\n/g,'\n> ')).join('\n');
  if(b.block_type===31){const cols=b.table.property.column_size,rows=[];for(let i=0;i<(b.children||[]).length;i+=cols)rows.push(b.children.slice(i,i+cols).map(c=>(by.get(c)?.children||[]).map(x=>serialize(x)).join('<br>').replace(/\|/g,'\\|')));return rows.map((r,i)=>'| '+r.join(' | ')+' |'+(i===0?'\n| '+r.map(()=> '---').join(' | ')+' |':'')).join('\n');}
  const key=textKey(b);if(!key)throw Error('节点包含暂不支持回写的文档组件');
  const prefix=b.block_type===12?'- ':b.block_type===13?'1. ':b.block_type>=3&&b.block_type<=11?'#'.repeat(b.block_type-2)+' ':b.block_type===15?'> ':'';
  const body=b.block_type===14?'```\n'+plain(b)+'\n```':prefix+rich(b);
  return [body,...(b.children||[]).map(c=>serialize(c,depth+1)).filter(Boolean).map(t=>'  '+t.replace(/\n/g,'\n  '))].join('\n');
 };
 for(const [node,id] of Object.entries(nodeBlocks)){
  const b=by.get(id);if(!b)throw Error('飞书节点整节被删除，请先处理结构变化');
  const parent=Object.entries(nodeBlocks).find(([,bid])=>bid===b.parent_id)?.[0]||null;
  const body=[];let prompt='';
  for(const child of b.children||[]){if(titles.has(child))continue;const c=by.get(child);
   if(c?.block_type===34&&plain(by.get(c.children?.[0])).startsWith('出处：')){protectedBlocks.push({id:child,citation:(c.children||[]).map(x=>plain(by.get(x)))});continue;}
   if(plain(c).startsWith('原始问题：')){prompt=plain(c).slice(5);continue;}
   const t=serialize(child);if(t)body.push(t);
  }
  fields[node]={title:plain(b),text:body.join('\n\n'),prompt,parentId:parent};
 }
 // Content outside mapped nodes must not disappear during the next push.
 const owned=new Set();function mark(id){if(owned.has(id))return;owned.add(id);for(const c of by.get(id)?.children||[])mark(c);}
 titles.forEach(mark);
 const outside=items.filter(b=>!owned.has(b.block_id)&&b.block_type!==1).map(b=>({id:b.block_id,type:b.block_type,text:plain(b)}));
 return {fields,protectedBlocks,outside};
}
export function remoteChanges(baseline,current,nodeBlocks,baseNodes){
 const a=projectRemoteFields(baseline,nodeBlocks),b=projectRemoteFields(current,nodeBlocks);
 if(JSON.stringify(a.protectedBlocks)!==JSON.stringify(b.protectedBlocks))throw Error('飞书的图片或出处已变化，已保留两边版本；此类变化需要单独处理');
 if(JSON.stringify(a.outside)!==JSON.stringify(b.outside))throw Error('飞书节点以外的正文或结构已变化，已暂停覆盖');
 const changes=[];
 for(const [id,after] of Object.entries(b.fields)){
  if(a.fields[id].parentId!==after.parentId)throw Error('飞书节点层级已变化，已暂停覆盖');
  const base=baseNodes.find(n=>n.id===id);if(!base)throw Error('缺少节点共同版本');const fields={};
  for(const key of ['title','text','prompt'])if(a.fields[id][key]!==after[key])fields[key]={base:base[key]||'',value:after[key]};
  if(Object.keys(fields).length)changes.push({id,title:base.title,fields});
 }
 return changes;
}
