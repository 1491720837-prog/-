export function safeWebURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function podcastDocument({id,title,text,sourceUrl,minuteUrl,jobId,duration}){
  if(typeof text!=='string'||!text.trim()||text.length>4_000_000)throw Error('逐字稿为空或超出支持长度');
  if(!safeWebURL(sourceUrl)||!safeWebURL(minuteUrl))throw Error('播客出处链接无效');
  return {id,name:String(title).slice(0,500),type:'text',pages:1,text,translations:{},contentKind:'podcast',provenance:{sourceUrl,minuteUrl,jobId,duration:duration||null,importedAt:new Date().toISOString(),transcription:'feishu-minutes'}};
}
export function articleDocument(capture,id){
  if(!capture||typeof capture.text!=='string'||capture.text.trim().length<10||capture.text.length>1_000_000||!safeWebURL(capture.url))throw Error('采集内容不完整，未导入');
  const blocks=Array.isArray(capture.blocks)?capture.blocks.slice(0,2000).flatMap(b=>b?.type==='text'&&typeof b.text==='string'?[{type:'text',text:b.text.slice(0,1_000_000)}]:b?.type==='image'&&safeWebURL(b.url)?[{type:'image',url:safeWebURL(b.url),alt:String(b.alt||'').slice(0,500)}]:[]):[];
  return {id,name:String(capture.title||'采集文章').slice(0,500),type:'text',pages:1,text:capture.text,contentBlocks:blocks,translations:{},contentKind:'article',provenance:{sourceUrl:safeWebURL(capture.url),author:String(capture.author||'').slice(0,200),importedAt:new Date().toISOString(),capture:'browser'}};
}
export function textParts(doc){return doc.text.split(/\n\s*\n/);}
export function textCorpus(doc){let text=doc.text;const parts=[];while(text.length){let end=Math.min(text.length,80000);if(end<text.length){const split=text.lastIndexOf('\n',end);if(split>end/2)end=split;}parts.push(text.slice(0,end));text=text.slice(end);}return (parts.length?parts:['']).map((text,i)=>({docId:doc.id,name:doc.name+(doc.contentKind==='podcast'?' · 飞书逐字稿（按原有时间戳引用）':''),page:i+1,side:'en',text,kind:doc.contentKind||'text'}));}
export function contentSourceLabel(doc,source={}){
  if(doc?.contentKind==='podcast')return `${doc.name} · 播客逐字稿${source.section?' · 第 '+(Number(source.section.slice(1))+1)+' 段':''}`;
  if(doc?.contentKind==='article')return `${doc.name} · 文章摘录`;
  return '';
}
