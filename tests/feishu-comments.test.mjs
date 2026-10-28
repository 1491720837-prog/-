import test from 'node:test';import assert from 'node:assert/strict';
import {eligibleReplies,locateComment,validatePlan,replaceSelection,FeishuComments} from '../scripts/feishu-comments.mjs';
import {mergeFeishuChanges} from '../dist/feishu-merge.js';
import {FeishuSync,contentSignature} from '../scripts/feishu-sync.mjs';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const reply=(id,text,user='me')=>({reply_id:id,user_id:user,content:{elements:[{text_run:{text}}]}});
const comment={comment_id:'c',quote:'旧文字',relation:{relation:JSON.stringify({doc:{positionInfo:{blockID:'body'}}})},reply_list:{replies:[reply('r','AI：把这段改得通俗一点')]}};
test('owner only, explicit activation, followup and AI loop exclusion',()=>{
 const c={comment_id:'c',reply_list:{replies:[reply('a','普通讨论'),reply('b','AI：偷发文件','other'),reply('c','AI：解释'),reply('d','继续说明'),reply('e','【Folio AI · test】回复')]}};
 assert.deepEqual(eligibleReplies(c,'me',{}).map(r=>r.reply_id),['c','d']);
 assert.deepEqual(eligibleReplies(c,'me',{'c:c':{commentId:'c'},'c:d':{commentId:'c'}}).map(r=>r.reply_id),[]);
});
test('comment needs an exact live mapped block; deleted and whole comments are rejected',()=>{
 assert.equal(locateComment(comment,{body:'node'},[{block_id:'body'}]).nodeId,'node');
 assert.throws(()=>locateComment({...comment,is_whole:true},{},[]));
 assert.throws(()=>locateComment({...comment,relation:{content_deleted:true}},{},[]));
 assert.throws(()=>locateComment({...comment,relation:null},{body:'node'},[{block_id:'body'}]));
});
test('selected text replacement preserves unselected styles and rejects ambiguous selection',()=>{
 const block={text:{elements:[{text_run:{content:'前旧',text_element_style:{bold:true}}},{text_run:{content:'文字后',text_element_style:{italic:true}}}]}};
 const result=replaceSelection(block,'旧文字','新词');assert.equal(result.map(e=>e.text_run.content).join(''),'前新词后');assert.equal(result.at(-1).text_run.text_element_style.italic,true);
 assert.throws(()=>replaceSelection({text:{elements:[{text_run:{content:'重复重复'}}]}},'重复','新'));
});
test('question alone cannot authorize document edits or persistent preferences',()=>{
 assert.throws(()=>validatePlan({action:'append',answer:'a',category:'解释',title:'t',content:'c'},'这是什么意思？'));
 assert.throws(()=>validatePlan({action:'append',answer:'a',category:'解释',title:'t',content:'c'},'不要写入正文，只解释一下'));
 assert.throws(()=>validatePlan({action:'replace',answer:'a',category:'解释',content:'c'},'不要修改原文'));
 assert.throws(()=>validatePlan({action:'preference',answer:'a',category:'偏好',scope:'global',preference:'短句'},'这句话简短一点'));
 assert.equal(validatePlan({action:'preference',answer:'a',category:'偏好',scope:'global',preference:'短句'},'本篇以后用短句').scope,'project');
});
test('new AI nodes preserve canvas, append once and require a live parent',()=>{
 const p={nodes:[{id:'p',x:10,y:20,title:'父节点'}],edges:[]},n={id:'child',parentId:'p',title:'答复',text:'内容'};
 const r=mergeFeishuChanges(p,[],undefined,[n]);assert.equal(r.project.nodes.length,2);assert.ok(r.project.nodes[1].x>10);
 assert.equal(mergeFeishuChanges(r.project,[],undefined,[n]).project.nodes.length,2);
 assert.equal(mergeFeishuChanges({...p,nodes:[]},[],undefined,[n]).conflicts.length,1);
});
test('replace commits exact block, queues canvas delivery and replies only after ACK',async()=>{
 const root=await mkdtemp(join(tmpdir(),'folio-comment-'));
 try{
  const sync=new FeishuSync({root});await sync.ready;const svc=new FeishuComments(sync);await svc.ready;svc.state.enabled=true;svc.state.owner='me';sync.state.enabled=true;
  const text=t=>({elements:[{text_run:{content:t}}]});let items=[{block_id:'title',block_type:13,ordered:text('标题'),children:['body']},{block_id:'body',parent_id:'title',block_type:2,text:text('前旧文字后')}];
  const snapshot={projectId:'p',title:'P',nodes:[{id:'n',title:'标题',text:'前旧文字后',prompt:'',path:[1]}],docs:[],edges:[]};
  sync.state.projects.p={doc:'doc',nodeBlocks:{n:'title'},blockNodes:{title:'n',body:'n'},remoteHash:contentSignature('before')};
  await mkdir(join(root,'p'));await writeFile(join(root,'p','readback-base.json'),JSON.stringify({snapshot,items}));
  svc.comments=async()=>[comment];let xml='before',replies=0;
  sync.fetch=async()=>({content:xml,revision_id:xml==='before'?1:2});sync.nativeBlocks=async()=>structuredClone(items);
  sync.cli=async args=>{if(args[0]==='api'){const payload=JSON.parse(args.at(-1));items[1].text.elements=payload.update_text_elements.elements;xml='after';return {};}
   replies++;return {reply_id:'ai'};};
  const j=await svc.next('p');assert.equal(j.nodeId,'n');
  await svc.complete({id:j.id,plan:{action:'replace',answer:'说明',category:'改写',content:'新文字'},model:'test'});
  assert.equal(replies,0);const incoming=await sync.pull('p');assert.equal(incoming.changes[0].fields.text.value,'前新文字后');
  await sync.acknowledge('p',incoming.token);await svc.afterAck('p');assert.equal(replies,1);assert.equal(svc.state.jobs[j.id].status,'done');
  assert.equal(svc.state.categories['改写'].count,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
