import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {renderProject,topBlocks} from '../dist/feishu-format.js';
import {nativeOutline} from './feishu-outline.mjs';
import {remoteChanges} from './feishu-readback.mjs';
import {larkIdentity,identityHint} from './lark-identity.mjs';
const exec=promisify(execFile),hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export function contentSignature(xml){
 return hash(xml.replace(/\s+id="[^"]*"/g,'').replace(/<img\b[^>]*\/?>/g,tag=>'<img '+['src','token','caption'].map(a=>a+'='+JSON.stringify(tag.match(new RegExp('\\b'+a+'="([^"]*)"'))?.[1]||'')).join(' ')+'/>'));
}
const networkFailure=message=>/no such host|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|operation timed out|i\/o timeout|network is unreachable|TLS handshake timeout/i.test(message||'');
export const parentNode='HP8Wwh1rwiLzPYkVwSFco1Tinzf';
export class FeishuSync {
 constructor({root=resolve('artifacts/feishu-sync'),run=exec}={}){this.root=root;this.run=run;this.pending=new Map();this.running=false;this.saving=Promise.resolve();this.ready=this.init();}
 async init(){await mkdir(this.root,{recursive:true});try{this.state=JSON.parse(await readFile(join(this.root,'state.json'),'utf8'));}catch{this.state={enabled:false,projects:{}};}for(const p of Object.values(this.state.projects)){if(p.status==='syncing')p.status='interrupted';if(p.status==='conflict'&&networkFailure(p.message))p.status='failed';}await this.save();}
 async save(){const text=JSON.stringify(this.state,null,2);const next=this.saving.catch(()=>{}).then(async()=>{await writeFile(join(this.root,'state.tmp'),text);await rename(join(this.root,'state.tmp'),join(this.root,'state.json'));});this.saving=next;return next;}
 async cli(args){const identity=larkIdentity();try{const r=await this.run(process.env.FOLIO_LARK_BIN||'lark-cli',[...args,'--as',identity,'--format','json'],{timeout:240000,maxBuffer:25e6,env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1',LARKSUITE_CLI_NO_SKILLS_NOTIFIER:'1'}});const j=JSON.parse(r.stdout);if(j.ok!==true||['failed','partial_success'].includes(j.data?.result))throw Error(j.error?.message||JSON.stringify(j.data));return j.data;}catch(e){let message=e.message;try{message=JSON.parse(e.stderr).error.message;}catch{}throw Error(identityHint(identity,message).slice(0,1200));}}
 async status(){await this.ready;return {enabled:this.state.enabled,identity:larkIdentity(),parentUrl:'https://my.feishu.cn/wiki/'+parentNode,projects:Object.entries(this.state.projects).map(([id,p])=>({id,title:p.title,url:p.url,status:p.status,message:p.message,updatedAt:p.updatedAt,nodes:p.nodes,images:p.images}))};}
 async configure(enabled){await this.ready;this.state.enabled=!!enabled;await this.save();return this.status();}
 async enqueue(s){await this.ready;if(!this.state.enabled)throw Error('飞书同步尚未启用');if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(s.projectId)||!Array.isArray(s.nodes)||!Array.isArray(s.docs)||!Array.isArray(s.edges)||typeof s.title!=='string')throw Error('项目格式无效');
  if(s.nodes.length>5000)throw Error('项目节点超过同步上限 5000');
  const p=this.state.projects[s.projectId]||={title:s.title,status:'queued',assets:{}};
  if(p.incoming)throw Error('飞书有待合并的更新，请先接收飞书修改');
  const digest=hash(s);if(p.digest===digest&&p.formatVersion===3&&!this.pending.has(s.projectId))return {unchanged:true};
  // Remote edits require explicit resolution, never silently overwrite them.
  if(p.status==='conflict')throw Error('飞书文档有手动修改，已暂停此项目同步；请先处理冲突');
  this.pending.set(s.projectId,{s,digest});await writeFile(join(this.root,s.projectId+'.json'),JSON.stringify(s));
  if(p.status!=='syncing')p.status='queued';await this.save();this.drain();return {queued:true};
 }
 async drain(){if(this.running||this.reading)return;this.running=true;try{while(this.pending.size&&this.state.enabled){const [id,task]=this.pending.entries().next().value;this.pending.delete(id);try{await this.sync(task.s,task.digest);}catch(e){const p=this.state.projects[id];p.status=e.conflict?'conflict':'failed';p.message=e.message;await this.save();}}}finally{this.running=false;}}
 async fetch(doc){return (await this.cli(['docs','+fetch','--doc',doc,'--detail','full'])).document;}
 async update(doc,command,args=[]){return this.cli(['docs','+update','--doc',doc,'--command',command,...args]);}
 async nativeBlocks(doc,revision=-1){const items=[];let page_token;do{const r=await this.cli(['api','GET',`/open-apis/docx/v1/documents/${doc}/blocks`,'--params',JSON.stringify({page_size:500,document_revision_id:revision,...(page_token?{page_token}:{})})]);items.push(...r.items);page_token=r.has_more?r.page_token:null;}while(page_token);return items;}
 async readbackBase(id){
  const dir=join(this.root,id),p=this.state.projects[id];
  try{return JSON.parse(await readFile(join(dir,'readback-base.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const snapshot=JSON.parse(await readFile(join(this.root,id+'.json'),'utf8'));
  if(hash(snapshot)!==p.digest)throw Error('旧同步缺少可验证的共同版本，已保留双方内容');
  const base={snapshot,items:await this.nativeBlocks(p.doc,p.revision)};
  await writeFile(join(dir,'readback-base.json'),JSON.stringify(base));return base;
 }
 async pull(id){
  await this.ready;const p=this.state.projects[id];if(!this.state.enabled||!p?.doc||!p.nodeBlocks)return {unchanged:true};
  if(this.running||this.reading||this.pending.size)return {busy:true};
  this.reading=true;
  try{
   if(p.staging)throw Error('上次同步尚未完成，请先恢复同步');
   if(p.incoming?.commentJob){const incoming=JSON.parse(await readFile(join(this.root,id,'incoming.json'),'utf8'));return {projectId:id,token:incoming.token,changes:incoming.changes,additions:incoming.additions};}
   const base=await this.readbackBase(id),doc=await this.fetch(p.doc),signature=contentSignature(doc.content);
   if(signature===p.remoteHash&&!p.incoming)return {unchanged:true};
   const items=await this.nativeBlocks(p.doc,doc.revision_id);
   const changes=remoteChanges(base.items,items,p.nodeBlocks,base.snapshot.nodes);
   const token=hash({id,revision:doc.revision_id,signature});
   await writeFile(join(this.root,id,'incoming.json'),JSON.stringify({items,changes,token,signature,revision:doc.revision_id}));
   p.incoming={token,changes};p.status='incoming';p.message='飞书修改待合并到工作台';await this.save();
   return {projectId:id,token,changes};
  }catch(e){p.status=networkFailure(e.message)?'failed':'conflict';p.message=e.message;await this.save();throw e;}
  finally{this.reading=false;this.drain();}
 }
 async acknowledge(id,token){
  await this.ready;const p=this.state.projects[id];if(!p)throw Error('项目不存在');
  if(p.lastReceived===token)return {ok:true};
  if(this.running||this.reading)throw Error('同步进行中，请稍后重试');
  if(p.incoming?.token!==token)throw Error('飞书修改版本已变化，请重新接收');
  this.reading=true;
  try{
   const dir=join(this.root,id),incoming=JSON.parse(await readFile(join(dir,'incoming.json'),'utf8')),base=await this.readbackBase(id);
   await mkdir(join(dir,'history'),{recursive:true});await writeFile(join(dir,'history',Date.now()+'-before-readback.json'),JSON.stringify(base));
   for(const c of incoming.changes){const n=base.snapshot.nodes.find(n=>n.id===c.id);for(const [field,d] of Object.entries(c.fields))n[field]=d.value;}
   for(const n of incoming.additions||[]){if(!base.snapshot.nodes.some(x=>x.id===n.id)){const canonical={id:n.id,title:n.title,text:n.text||'',prompt:n.prompt||'',image:n.image||'',kind:n.kind,parentId:n.parentId||null,parentLabel:n.parentLabel||'父子',path:n.path,source:n.source||null};let index=base.snapshot.nodes.findIndex(x=>x.id===n.parentId)+1;while(index<base.snapshot.nodes.length&&base.snapshot.nodes[index].path.length>=n.path.length)index++;base.snapshot.nodes.splice(index,0,canonical);}}
   p.nodes=base.snapshot.nodes.length;
   const byId=new Map(incoming.items.map(b=>[b.block_id,b])),owners={},titleOwners=Object.fromEntries(Object.entries(p.nodeBlocks||{}).map(([node,block])=>[block,node]));
   const seen=new Set();function own(id,owner){if(seen.has(id))return;seen.add(id);owner=titleOwners[id]||owner;owners[id]=owner;for(const c of byId.get(id)?.children||[])own(c,owner);}
   for(const [id,node] of Object.entries(titleOwners))own(id,node);p.blockNodes=owners;
   base.items=incoming.items;await writeFile(join(dir,'readback-base.json'),JSON.stringify(base));
   p.digest=hash(base.snapshot);p.remoteHash=incoming.signature;p.revision=incoming.revision;p.lastReceived=token;delete p.incoming;
   p.status='synced';p.message='飞书修改已接收到工作台';p.updatedAt=new Date().toISOString();await this.save();return {ok:true};
  }finally{this.reading=false;this.drain();}
 }
 async protectComments(doc){const r=await this.cli(['drive','+list-comments','--token',doc,'--type','docx','--page-size','1']);if(r.items?.length||r.has_more){const e=Error('飞书文档有待处理评论，已暂停重建以保护评论位置；请先让 AI 处理评论');e.conflict=true;throw e;}}
 async sync(s,digest){
  const p=this.state.projects[s.projectId],dir=join(this.root,s.projectId);await mkdir(dir,{recursive:true});p.status='syncing';p.message='准备同步';await this.save();
  if(!p.doc){const reserved=this.state.reserved?.[s.title];const r=reserved||await this.cli(['wiki','+node-create','--parent-node-token',parentNode,'--title',s.title]);if(reserved)delete this.state.reserved[s.title];Object.assign(p,{doc:r.obj_token,node:r.node_token,url:r.url||'https://my.feishu.cn/wiki/'+r.node_token});await this.save();}
  let before=await this.fetch(p.doc);
  if(p.remoteHash?contentSignature(before.content)!==p.remoteHash:p.revision!=null&&before.revision_id!==p.revision){const e=Error('检测到飞书正文有修改，已暂停自动覆盖；工作台内容已保存在本机');e.conflict=true;throw e;}
  if(p.staging){throw Error('上次同步中断，旧正文已保留；请先检查暂存内容后恢复同步');}
  await this.protectComments(p.doc);
  const originalNative=await this.nativeBlocks(p.doc);
  if(originalNative.some(b=>JSON.stringify(b).match(/"comment_ids":\["/))){const e=Error('正文包含评论锚点，已暂停重建以保护评论');e.conflict=true;throw e;}
  // Files are uploaded once by digest and retained if removed from a later map.
  const links={},assets=p.assets||={};
  for(const d of s.docs){for(const f of [d,d.translationPDF].filter(f=>f?.data)){
   const bytes=Buffer.from(f.data,'base64');if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('文献 PDF 数据无效');const key=hash(bytes);
   if(!assets[key]){p.message='上传文献：'+f.name;await this.save();const file=join(dir,key+'.pdf');await writeFile(file,bytes);const r=await this.cli(['drive','+upload','--file',relative(process.cwd(),file),'--wiki-token',p.node,'--name',f.name+'.pdf']);assets[key]={...r};await this.save();}
   const a=assets[key];links[f.id]=a.url||a.file_url||('https://my.feishu.cn/file/'+a.file_token);
  }}
  if(p.title!==s.title){await this.cli(['drive','files','patch','--params',JSON.stringify({file_token:p.node,type:'wiki'}),'--data',JSON.stringify({new_title:s.title})]);p.title=s.title;before=await this.fetch(p.doc);}
  const old=topBlocks(before.content);await writeFile(join(dir,'previous.xml'),before.content);
  const xml=renderProject(s,links,{nodeMarkers:true}),file=join(dir,'content.xml');await writeFile(file,xml);
  p.staging=true;p.message='写入节点层级与正文';await this.save();
  try{
   // Stage a complete replacement before removing old blocks. A failed image never erases the last good document.
   const parts=xml.split(/<p>FOLIO_IMAGE_([^<]+)<\/p>/),imageOrder=[];
   const cachedImages=p.imageBlocks||{},nextImages={};
   for(let index=0;index<parts.length;index++){
    if(index%2===0){if(parts[index].trim()){const chunk=join(dir,'part-'+index+'.xml');await writeFile(chunk,parts[index]);await this.update(p.doc,'append',['--content','@'+relative(process.cwd(),chunk)]);}continue;}
    const n=s.nodes.find(n=>'FOLIO_IMAGE_'+n.id==='FOLIO_IMAGE_'+parts[index]);if(!n)throw Error('图片节点未找到');
    p.message='插入节点图片：'+n.title;await this.save();
    const key=hash(n.image),cached=cachedImages[key];imageOrder.push(key);
    if(cached&&originalNative.some(b=>b.block_id===cached))await this.update(p.doc,'block_copy_insert_after',['--block-id','-1','--src-block-ids',cached]);
    else{
     const m=n.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw Error('图片格式无效：'+n.title);
     const path=join(dir,key+'.'+m[1]);await writeFile(path,Buffer.from(m[2],'base64'));
     await this.cli(['docs','+media-insert','--doc',p.doc,'--file',relative(process.cwd(),path),'--caption',n.title||'节点图片']);
    }
   }
   const staged=await this.fetch(p.doc),oldIds=new Set(old.map(b=>b.id)),blocks=topBlocks(staged.content).filter(b=>!oldIds.has(b.id));
   const imgs=blocks.filter(b=>b.tag==='img');if(imgs.length!==imageOrder.length)throw Error('节点图片数量核验失败');
   imgs.forEach((b,i)=>nextImages[imageOrder[i]]=b.id);
   const headings=blocks.filter(b=>/^h[1-9]$/.test(b.tag));if(headings.length<s.nodes.length)throw Error('节点层级核验失败');
   if(blocks.some(b=>b.xml.includes('FOLIO_IMAGE_')))throw Error('存在未插入的节点图片');
   p.message='生成原生编号与层级';await this.save();
   const plan=nativeOutline(await this.nativeBlocks(p.doc),blocks.map(b=>b.id),s.nodes,{marked:true});
   const payload=join(dir,'native-outline.json');await writeFile(payload,JSON.stringify({children_id:plan.children_id,descendants:plan.descendants}));
   const created=await this.cli(['api','POST',`/open-apis/docx/v1/documents/${p.doc}/blocks/${p.doc}/descendant`,'--data','@'+relative(process.cwd(),payload)]);
   const ids=Object.fromEntries(created.block_id_relations.map(r=>[r.temporary_block_id,r.block_id]));
   for(const img of plan.images){
    const n=s.nodes.find(n=>n.id===plan.owners[img.temporaryId]);
    const m=n?.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw Error('节点图片源数据缺失');
    const imageFile=join(dir,hash(n.image)+'.'+m[1]);await writeFile(imageFile,Buffer.from(m[2],'base64'));
    const uploaded=await this.cli(['docs','+media-upload','--doc-id',p.doc,'--parent-node',ids[img.temporaryId],'--parent-type','docx_image','--file',relative(process.cwd(),imageFile)]);
    img.token=uploaded.file_token;if(!img.token)throw Error('图片上传未返回素材标识');
    await this.cli(['api','PATCH',`/open-apis/docx/v1/documents/${p.doc}/blocks/${ids[img.temporaryId]}`,'--data',JSON.stringify({replace_image:{token:img.token,width:img.width,height:img.height,caption:img.caption}})]);
   }
   imgs.forEach((b,i)=>nextImages[imageOrder[i]]=ids[b.id]);
   const check=await this.nativeBlocks(p.doc),byId=new Map(check.map(b=>[b.block_id,b]));
   for(const [node,id] of Object.entries(plan.nodeTitles))if(byId.get(ids[id])?.block_type!==13)throw Error('原生编号核验失败：'+node);
   for(const img of plan.images)if(byId.get(ids[img.temporaryId])?.image?.token!==img.token)throw Error('图片素材核验失败');
   // Recheck immediately before removing any published blocks. Comments are never
   // consumed as instructions by the synchronizer.
   await this.protectComments(p.doc);
   const discard=[...old,...blocks];
   for(let i=0;i<discard.length;i+=40)await this.update(p.doc,'block_delete',['--block-id',discard.slice(i,i+40).map(b=>b.id).join(',')]);
   const final=await this.fetch(p.doc);p.revision=final.revision_id;p.remoteHash=contentSignature(final.content);p.imageBlocks=nextImages;p.nodeBlocks=Object.fromEntries(Object.entries(plan.nodeTitles).map(([n,id])=>[n,ids[id]]));p.blockNodes=Object.fromEntries(Object.entries(plan.owners).map(([id,n])=>[ids[id],n]));p.formatVersion=3;p.digest=digest;p.staging=false;p.nodes=s.nodes.length;p.images=s.nodes.filter(n=>n.image).length;p.updatedAt=new Date().toISOString();p.status='synced';p.message='原生编号、正文、图片与原文件已同步';await writeFile(join(dir,'readback-base.json'),JSON.stringify({snapshot:s,items:await this.nativeBlocks(p.doc,final.revision_id)}));await this.save();
  }catch(e){
   // Roll back only newly staged blocks; old published blocks remain unless final cleanup had begun.
   try{await this.protectComments(p.doc);const current=await this.fetch(p.doc),oldIds=new Set(old.map(b=>b.id)),currentBlocks=topBlocks(current.content);if(old.every(b=>currentBlocks.some(c=>c.id===b.id))){const added=currentBlocks.filter(b=>!oldIds.has(b.id));for(let i=0;i<added.length;i+=40)await this.update(p.doc,'block_delete',['--block-id',added.slice(i,i+40).map(b=>b.id).join(',')]);p.staging=false;const restored=await this.fetch(p.doc);p.revision=restored.revision_id;p.remoteHash=contentSignature(restored.content);}}catch{}
   await this.save();
   throw e;
  }
 }
}
