import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {contentSignature} from './feishu-sync.mjs';
import {remoteChanges,projectRemoteFields} from './feishu-readback.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const replyText=r=>(r.content?.elements||[]).map(e=>e.text_run?.text||'').join('');
export function locateComment(comment, mapping, items){
 if(comment.is_whole||comment.is_solved||comment.relation?.content_deleted)throw Error('评论已解决、为全文评论或选区已删除，不能自动处理');
 let relation;try{relation=JSON.parse(comment.relation?.relation||'{}');}catch{throw Error('评论定位数据无效');}
 const ids=[...new Set(Object.values(relation).map(r=>r.positionInfo?.blockID).filter(Boolean))];
 if(ids.length!==1||!items.some(b=>b.block_id===ids[0])||!mapping[ids[0]])throw Error('无法唯一定位到画布节点，请在该节点正文重新划选并评论 AI：…');
 return {blockId:ids[0],nodeId:mapping[ids[0]],quote:comment.quote||''};
}
export function eligibleReplies(c,owner,jobs){
 const replies=c.reply_list?.replies||[];let activated=false;
 return replies.filter(r=>{
  const t=replyText(r);if(r.user_id!==owner||t.startsWith('【Folio AI ·'))return false;
  if(/^\s*AI\s*[:：]/i.test(t)||jobs[c.comment_id+':'+r.reply_id])activated=true;
  return activated&&!jobs[c.comment_id+':'+r.reply_id];
 });
}
export function validatePlan(plan,question){
 if(!plan||!['reply','append','replace','preference'].includes(plan.action))throw Error('AI 未返回有效操作类型');
 for(const k of ['answer','category'])if(typeof plan[k]!=='string'||!plan[k].trim())throw Error('AI 返回内容不完整');
 if(['__proto__','constructor','prototype'].includes(plan.category))throw Error('问题分类名称无效');
 if(plan.answer.length>18000||plan.category.length>40)throw Error('AI 回答过长');
 // Model classifies intent, but only explicit writing requests grant write capability.
 if(['append','replace'].includes(plan.action)&&/(不要|别|无需|不用|不必|暂不|先不).{0,10}(写入|添加|插入|改写|修改|替换|动原文)|只(需|要)?(回复|解释)/.test(question))throw Error('本条评论要求保留正文，请只回复解释');
 if(plan.action==='preference'&&!plan.forget&&/(不要|别|不用|无需).{0,6}(记住|保存)/.test(question))throw Error('本条评论未授权保存偏好');
 if(plan.action==='append'&&!/(添加|插入|写入|写到|放到|加到|补充到|新增|生成.*节点|add|insert|append)/i.test(question))throw Error('未明确要求写入，请回复“添加到正文”后再执行');
 if(plan.action==='replace'&&!/(改|替换|重写|润色|replace|rewrite|edit)/i.test(question))throw Error('未明确要求改写选区');
 if(plan.action==='preference'&&!/(以后|今后|记住|偏好|始终|默认|忘掉|取消.*习惯|forget|remember|always)/i.test(question))throw Error('未明确要求记住偏好');
 if(['append','replace'].includes(plan.action)&&(typeof plan.content!=='string'||!plan.content.trim()||plan.content.length>30000))throw Error('AI 未返回有效正文');
 if(plan.action==='append'&&(typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>180))throw Error('AI 未返回有效节点标题');
 if(plan.action==='preference'&&(!['project','global'].includes(plan.scope)||typeof plan.preference!=='string'||!plan.preference.trim()||plan.preference.length>1500))throw Error('偏好范围或内容无效');
 if(plan.scope==='global'&&/(本篇|这篇|本项目|这个项目)/.test(question))plan.scope='project';
 return plan;
}
export function replaceSelection(block,quote,replacement){
 const key=['text','ordered','bullet',...Array.from({length:9},(_,i)=>'heading'+(i+1))].find(k=>block[k]);
 const elements=block[key]?.elements;
 if(!elements?.length||elements.some(e=>!e.text_run))throw Error('选区包含非文本组件，已保留原文');
 const plain=elements.map(e=>e.text_run.content).join(''),start=plain.indexOf(quote);
 if(!quote||start<0||plain.indexOf(quote,start+quote.length)>=0)throw Error('选区已变化或同段存在重复文字，请重新选择');
 const end=start+quote.length,out=[];let offset=0,inserted=false;
 for(const e of elements){const t=e.text_run.content,a=offset,b=offset+t.length;offset=b;
  const piece=(text)=>{if(text)out.push({text_run:{...e.text_run,content:text}});};
  if(b<=start||a>=end){piece(t);continue;}
  piece(t.slice(0,Math.max(0,start-a)));
  if(!inserted){piece(replacement);inserted=true;}
  piece(t.slice(Math.max(0,end-a)));
 }
 return out;
}
const el=t=>({text_run:{content:t}});
function answerBlocks(text){return text.split(/\n\s*\n/).filter(x=>x.trim()).map((t,i)=>({block_id:'body'+i,block_type:2,text:{elements:[el(t)]}}));}
export class FeishuComments {
 constructor(sync){this.sync=sync;this.file=join(sync.root,'comments.json');this.saving=Promise.resolve();this.ready=this.init();}
 async init(){await this.sync.ready;try{this.state=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.state={enabled:false,owner:'',jobs:{},preferences:[],categories:{}};}}
 async save(){const text=JSON.stringify(this.state,null,2);const next=this.saving.catch(()=>{}).then(async()=>{await writeFile(this.file+'.tmp',text);await rename(this.file+'.tmp',this.file);});this.saving=next;return next;}
 async configure(enabled){await this.ready;if(enabled&&!this.state.owner){const r=await this.sync.run('lark-cli',['auth','status','--json','--verify'],{});const a=JSON.parse(r.stdout);const u=a.identities?.user;if(!u?.verified||!u.openId)throw Error('需要有效的飞书用户身份');this.state.owner=u.openId;}this.state.enabled=!!enabled;await this.save();return this.status();}
 async status(){await this.ready;return {enabled:this.state.enabled,categories:this.state.categories,preferences:this.state.preferences.filter(p=>p.active!==false),jobs:Object.values(this.state.jobs).slice(-30).map(j=>({id:j.id,projectId:j.projectId,question:j.question,status:j.status,error:j.error,action:j.plan?.action,model:j.model,reasoningEffort:j.reasoningEffort,updatedAt:j.updatedAt}))};}
 async comments(doc){let token;const out=[];do{const r=await this.sync.cli(['drive','+list-comments','--token',doc,'--type','docx','--need-relation','--page-size','100',...(token?['--page-token',token]:[])]);out.push(...r.items);token=r.has_more?r.page_token:null;}while(token);for(const c of out){if(c.has_more||c.reply_list?.has_more){let cursor;const replies=[];do{const r=await this.sync.cli(['drive','file.comment.replys','list','--params',JSON.stringify({file_token:doc,file_type:'docx',comment_id:c.comment_id,user_id_type:'open_id',page_size:100,...(cursor?{page_token:cursor}:{})})]);replies.push(...r.items);cursor=r.has_more?r.page_token:null;}while(cursor);c.reply_list={replies};}c.reply_list?.replies?.sort((a,b)=>a.create_time-b.create_time||a.reply_id.localeCompare(b.reply_id));}return out;}
 async next(projectId){await this.ready;if(!this.state.enabled||!this.sync.state.enabled)return null;
  const p=this.sync.state.projects[projectId];if(!p?.doc||p.incoming||p.staging||this.sync.running||this.sync.reading)return null;
  // Resume only operations whose mutation outcome is known. Ambiguous writes require review.
  for(const j of Object.values(this.state.jobs).filter(j=>j.projectId===projectId)){
   if(j.status==='awaiting_canvas'&&p.lastReceived===j.token){await this.finish(j);}
   if(j.status==='replying'){await this.finish(j);}
   if(j.status==='writing'){j.status='needs_review';j.error='上次写入结果未确认，已暂停，避免重复添加';await this.save();}
   if(j.status==='generating'&&Date.now()-j.startedAt<360000)return null;
   if(j.status==='generating'){j.status='failed';j.error='生成中断，请重试';await this.save();}
  }
  const comments=await this.comments(p.doc),items=await this.sync.nativeBlocks(p.doc);
  for(const c of comments){if(c.is_whole||c.is_solved)continue;
   const r=eligibleReplies(c,this.state.owner,this.state.jobs)[0];if(!r)continue;
   const id=c.comment_id+':'+r.reply_id,j={id,projectId,doc:p.doc,commentId:c.comment_id,replyId:r.reply_id,question:replyText(r).replace(/^\s*AI\s*[:：]\s*/i,''),status:'generating',startedAt:Date.now(),history:(c.reply_list?.replies||[]).slice(0,(c.reply_list?.replies||[]).findIndex(x=>x.reply_id===r.reply_id)+1).filter(x=>x.user_id===this.state.owner).map(x=>({text:replyText(x)}))};
   try{Object.assign(j,locateComment(c,p.blockNodes,items));}catch(e){j.status='failed';j.error=e.message;}
   this.state.jobs[id]=j;await this.save();if(j.status==='failed'){await this.notifyFailure(j).catch(()=>{});continue;}
   return {...j,preferences:this.state.preferences.filter(x=>x.active!==false&&(x.scope==='global'||x.projectId===projectId)),categories:Object.keys(this.state.categories)};
  }return null;
 }
 async afterAck(projectId,{keptLocal=false}={}){await this.ready;const p=this.sync.state.projects[projectId];for(const j of Object.values(this.state.jobs))if(j.projectId===projectId&&j.status==='awaiting_canvas'&&j.token===p?.lastReceived){j.keptLocal=keptLocal;await this.finish(j);}}
 async fail(id,message){await this.ready;const j=this.state.jobs[id];if(j?.status==='generating'){j.status='failed';j.error=String(message).slice(0,1000);await this.save();await this.notifyFailure(j).catch(()=>{});}return {ok:true};}
 async notifyFailure(j){
  const c=(await this.comments(j.doc)).find(c=>c.comment_id===j.commentId);if(!c||c.is_solved||c.is_whole)return;
  const marker='【Folio AI · '+hash(j.id).slice(0,10)+' · 未完成】';if(c.reply_list?.replies.some(r=>replyText(r).startsWith(marker)))return;
  const text=(marker+'\n'+j.error+'。可在工作台「飞书同步 → 评论处理记录」查看或重试；也可以在此补充说明。').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  await this.sync.cli(['drive','file.comment.replys','create','--params',JSON.stringify({file_token:j.doc,file_type:'docx',comment_id:j.commentId}),'--data',JSON.stringify({content:{elements:[{type:'text_run',text_run:{text}}]}})]);
 }
 async retry(id){await this.ready;const j=this.state.jobs[id];if(!j||j.status!=='failed')throw Error('此操作不能自动重试');delete this.state.jobs[id];await this.save();return {ok:true};}
 async complete({id,plan,model,reasoningEffort,sources=[],provider='codex',attached=[],trace=[],warnings=[]}){
  await this.ready;const j=this.state.jobs[id];if(!j)throw Error('评论任务不存在');
  if(j.status!=='generating')return {status:j.status};
  if(!this.state.enabled||!this.sync.state.enabled)throw Error('评论 AI 已暂停');
  validatePlan(plan,j.question);Object.assign(j,{plan,model,reasoningEffort,sources});
  const s=this.sync,p=s.state.projects[j.projectId];
  const comments=await this.comments(j.doc),c=comments.find(c=>c.comment_id===j.commentId);
  if(!c||c.is_solved)throw Error('评论已解决或删除');
  const r=c.reply_list?.replies.find(r=>r.reply_id===j.replyId);
  if(!r||replyText(r).replace(/^\s*AI\s*[:：]\s*/i,'')!==j.question)throw Error('问题已编辑，请重新提问');
  if(plan.action==='preference'){
   const preference={id:hash([j.id,plan.preference]).slice(0,24),scope:plan.scope,projectId:j.projectId,text:plan.preference,source:{commentId:j.commentId,replyId:j.replyId,question:j.question},createdAt:new Date().toISOString(),active:true};
   if(plan.forget===true){const matches=this.state.preferences.filter(x=>x.active!==false&&x.text===plan.preference&&(x.scope==='global'||x.projectId===j.projectId));if(!matches.length)throw Error('没有找到完全匹配的偏好；请在工作台偏好列表中停用');matches.forEach(x=>x.active=false);}
   else if(!this.state.preferences.some(x=>x.id===preference.id))this.state.preferences.push(preference);
   j.status='replying';await this.save();await this.finish(j);return {status:j.status};
  }
  if(plan.action==='reply'){j.status='replying';await this.save();await this.finish(j);return {status:j.status};}
  if(s.running||s.reading||s.pending.size||p.incoming||p.staging)throw Error('项目正在同步，请稍后重试此评论');
  s.reading=true;
  try{
   const before=await s.fetch(j.doc);if(contentSignature(before.content)!==p.remoteHash)throw Error('正文有新修改，先合并双向同步后再重试');
   const base=await s.readbackBase(j.projectId),items=await s.nativeBlocks(j.doc,before.revision_id);
   const loc=locateComment(c,p.blockNodes,items);if(loc.blockId!==j.blockId||loc.nodeId!==j.nodeId)throw Error('评论位置已变化');
   const parent=base.snapshot.nodes.find(n=>n.id===j.nodeId);if(!parent)throw Error('源节点已删除');
   await mkdir(join(s.root,j.projectId,'history'),{recursive:true});await writeFile(join(s.root,j.projectId,'history',Date.now()+'-before-comment.json'),JSON.stringify({base,job:j}));
   const nodeBlocks={...p.nodeBlocks},blockNodes={...p.blockNodes};let additions=[];
   if(plan.action==='replace'){
    const block=items.find(b=>b.block_id===j.blockId),updated=structuredClone(items);
    const elements=replaceSelection(block,j.quote,plan.content),b=updated.find(b=>b.block_id===j.blockId);const key=['text','ordered','bullet',...Array.from({length:9},(_,i)=>'heading'+(i+1))].find(k=>b[k]);b[key].elements=elements;
    // Reject edits to protected citations before any mutation.
    remoteChanges(items,updated,nodeBlocks,base.snapshot.nodes);
    j.status='writing';await this.save();
    await s.cli(['api','PATCH',`/open-apis/docx/v1/documents/${j.doc}/blocks/${j.blockId}`,'--params',JSON.stringify({document_revision_id:before.revision_id,client_token:hash(j.id).slice(0,32)}),'--data',JSON.stringify({update_text_elements:{elements}})]);
   }else{
    const nodeId='feishu-'+hash(j.id).slice(0,24),body=answerBlocks(plan.content),desc=[{block_id:'answer',block_type:13,ordered:{elements:[{text_run:{content:plan.title,text_element_style:{bold:true}}}],style:{sequence:'auto'}}},...body];
    const prompt={block_id:'question',block_type:2,text:{elements:[el('原始问题：'+j.question)]}};desc.push(prompt);desc[0].children=['question',...body.map(b=>b.block_id)];
    const titleBlock=items.find(b=>b.block_id===nodeBlocks[parent.id]);
    const citation=(titleBlock.children||[]).map(id=>items.find(b=>b.block_id===id)).find(b=>b?.block_type===34&&JSON.stringify(items.find(x=>x.block_id===b.children?.[0])).includes('出处：'));
    if(citation){let copyIndex=0;const copy=(id)=>{const old=items.find(b=>b.block_id===id),b=structuredClone(old);delete b.parent_id;b.block_id='copy'+copyIndex++;if(b.children)b.children=b.children.map(copy);desc.push(b);return b.block_id;};desc[0].children.push(copy(citation.block_id));}
    if(desc.length>100)throw Error('回答段落太多，请缩短后重试');
    j.status='writing';await this.save();
    const created=await s.cli(['api','POST',`/open-apis/docx/v1/documents/${j.doc}/blocks/${nodeBlocks[parent.id]}/descendant`,'--params',JSON.stringify({document_revision_id:before.revision_id,client_token:hash(j.id).slice(0,32)}),'--data',JSON.stringify({children_id:['answer'],descendants:desc,index:-1})]);
    const ids=Object.fromEntries(created.block_id_relations.map(x=>[x.temporary_block_id,x.block_id]));
    nodeBlocks[nodeId]=ids.answer;Object.values(ids).forEach(id=>blockNodes[id]=nodeId);
    additions=[{id:nodeId,title:plan.title,text:plan.content,prompt:j.question,image:'',kind:'ai',parentId:parent.id,parentLabel:'父子',source:parent.source,path:[...parent.path,base.snapshot.nodes.filter(n=>n.parentId===parent.id).length+1],aiEvidence:{provider:provider==='api'?'api':'codex',model:model||'',reasoningEffort,sources,attached,trace,warnings},feishuComment:{commentId:j.commentId,replyId:j.replyId}}];
   }
   const after=await s.fetch(j.doc),newItems=await s.nativeBlocks(j.doc,after.revision_id);
   // Compare existing nodes with the new title excluded from its parent's body.
   const baseline=structuredClone(items);if(additions.length){const newId=nodeBlocks[additions[0].id];baseline.push(...newItems.filter(b=>blockNodes[b.block_id]===additions[0].id));}
   const changes=remoteChanges(baseline,newItems,nodeBlocks,[...base.snapshot.nodes,...additions]);
   const token=hash({job:j.id,revision:after.revision_id});
   await writeFile(join(s.root,j.projectId,'incoming.json'),JSON.stringify({items:newItems,changes:changes.filter(c=>!additions.some(n=>n.id===c.id)),additions,token,signature:contentSignature(after.content),revision:after.revision_id}));
   Object.assign(p,{nodeBlocks,blockNodes,incoming:{token,commentJob:j.id},status:'incoming',message:'AI 已写入飞书，等待画布接收'});
   j.status='awaiting_canvas';j.token=token;j.updatedAt=new Date().toISOString();await s.save();await this.save();return {status:j.status};
  }catch(e){if(j.status==='writing'){j.status='needs_review';j.error='写入结果需核对：'+e.message;await this.save();}throw e;}
  finally{s.reading=false;s.drain();}
 }
 async finish(j){
  const comments=await this.comments(j.doc),c=comments.find(c=>c.comment_id===j.commentId);if(!c||c.is_solved){j.status='reply_blocked';j.error='原评论已解决或删除，正文结果已保留';await this.save();return;}
  const marker='【Folio AI · '+hash(j.id).slice(0,10)+'】';
  if(!(c.reply_list?.replies||[]).some(r=>replyText(r).startsWith(marker))){
   const suffix=j.keptLocal?'\n\n飞书写入已完成；你选择保留工作台冲突版本，两边内容尚不一致。':j.plan.action==='append'?'\n\n已添加解释子节点，并同步到画布。':j.plan.action==='replace'?'\n\n已改写选区，并同步到画布。':j.plan.action==='preference'?'\n\n已'+(j.plan.forget?'停用':'保存')+'偏好（'+(j.plan.scope==='global'?'所有项目':'当前项目')+'）。':'';
   const text=(marker+' '+(j.model||'模型')+' · '+(j.reasoningEffort||'默认推理')+'\n'+j.plan.answer+suffix).replace(/</g,'&lt;').replace(/>/g,'&gt;');
   await this.sync.cli(['drive','file.comment.replys','create','--params',JSON.stringify({file_token:j.doc,file_type:'docx',comment_id:j.commentId}),'--data',JSON.stringify({content:{elements:[{type:'text_run',text_run:{text}}]}})]);
  }
  if(j.status!=='done'){const name=j.plan.category,cat=this.state.categories[name]||={count:0,examples:[]};cat.count++;cat.examples.push(j.question.slice(0,200));cat.examples=cat.examples.slice(-5);cat.shortcutCandidate=cat.count>3;}
  j.status='done';delete j.error;j.updatedAt=new Date().toISOString();await this.save();
 }
 async disablePreference(id){await this.ready;const p=this.state.preferences.find(x=>x.id===id);if(p)p.active=false;await this.save();return {ok:true};}
}
