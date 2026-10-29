// Convert staged document blocks to real nested ordered lists. Body blocks remain
// separate children; XML list parsing would otherwise concatenate paragraphs.
export function nativeOutline(items, rootIds, nodes, {marked=false}={}) {
 const by=new Map(items.map(b=>[b.block_id,structuredClone(b)]));
 const roots=[],nodeTitles={},owners={},images=[];let current=null,index=0;
 for(const id of rootIds){
  const b=by.get(id);if(!b)throw Error('暂存正文块缺失');
  const heading=b.block_type>=3&&b.block_type<=11,keyName='heading'+(b.block_type-2);
  const headingText=heading?b[keyName].elements.map(e=>e.text_run?.content||'').join(''):'';
  const marker=marked&&nodes[index]?'[FOLIO_NODE:'+nodes[index].id+'] ':'';
  if(heading&&index<nodes.length&&(!marked||headingText.startsWith(marker))){
   const n=nodes[index++],key='heading'+(b.block_type-2);
   const title=b[key].elements.map(e=>e.text_run?.content||'').join('');
   if(title!==(marker+(n.title||'未命名节点')))throw Error('节点标题顺序不一致');
   if(marked){let remaining=marker.length;b[key].elements=b[key].elements.map(e=>{if(!e.text_run||!remaining)return e;const content=e.text_run.content,cut=Math.min(content.length,remaining);remaining-=cut;return {...e,text_run:{...e.text_run,content:content.slice(cut)}};}).filter(e=>!e.text_run||e.text_run.content);}
   const elements=b[key].elements.map(e=>e.text_run?{text_run:{...e.text_run,text_element_style:{...e.text_run.text_element_style,bold:true}}}:e);
   delete b[key];b.block_type=13;b.ordered={elements,style:{sequence:'auto'}};b.children=[];
   nodeTitles[n.id]=id;owners[id]=n.id;current=id;
   const parent=nodeTitles[n.parentId];if(parent)by.get(parent).children.push(id);else roots.push(id);
  }else if(index===nodes.length&&heading&&(!marked||headingText==='[FOLIO_RELATIONS] 节点关联')){if(marked)b[keyName].elements=[{text_run:{content:'节点关联'}}];current=null;roots.push(id);}
  else if(current){by.get(current).children.push(id);}else roots.push(id);
 }
 if(index!==nodes.length)throw Error('节点数量不一致');
 const descendants=[];
 function visit(id,owner){const b=by.get(id);owner=owners[id]||owner;if(owner)owners[id]=owner;
  delete b.parent_id;
  if(b.block_type===27){images.push({temporaryId:id,...b.image});b.image={};}
  if(b.table){delete b.table.cells;delete b.table.property?.merge_info;}
  descendants.push(b);for(const c of b.children||[])visit(c,owner);
 }
 roots.forEach(id=>visit(id,null));
 if(descendants.length>1000)throw Error('本次文档超过 1000 个正文块，保留旧文档；需要分批同步');
 return {children_id:roots,descendants,nodeTitles,owners,images};
}
