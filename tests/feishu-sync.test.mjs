import test from 'node:test';import assert from 'node:assert/strict';
import {projectSnapshot,renderProject,topBlocks,prose} from '../dist/feishu-format.js';
const project={projectId:'p',title:'阅读',config:{apiKey:'SECRET'},docs:[],nodes:[{id:'b',parentId:'a',title:'Child',text:'answer',prompt:'why',image:'data:image/png;base64,YQ==',y:0},{id:'a',title:'Root',text:'parent',y:2},{id:'c',title:'Alone',text:'独立',y:5}],edges:[{from:'a',to:'c',label:'补充'}]};
test('hierarchy, independent nodes, questions, image position and relations are preserved',()=>{const s=projectSnapshot(project);assert.equal(s.config,undefined);assert.deepEqual(s.nodes.map(n=>[n.id,n.path]),[['a',[1]],['b',[1,1]],['c',[2]]]);const xml=renderProject(s);assert.ok(xml.indexOf('Child')<xml.indexOf('FOLIO_IMAGE_b'));assert.ok(xml.indexOf('FOLIO_IMAGE_b')<xml.indexOf('answer'));assert.match(xml,/原始问题/);assert.match(xml,/补充/);});
test('cycles fail without dropping nodes; view changes do not change exported content',()=>{assert.throws(()=>projectSnapshot({...project,nodes:[{id:'a',parentId:'b'},{id:'b',parentId:'a'}]}),/循环/);assert.deepEqual(projectSnapshot({...project,view:{scale:2}}),projectSnapshot(project));});
test('top level parsing keeps nested tables and images intact',()=>{assert.deepEqual(topBlocks('<title id="d">t</title><h1 id="h">title</h1><table id="t"><tr id="r"><td id="c"><p id="p">x</p></td></tr></table><img id="i" token="f"/>').map(x=>x.id),['h','t','i']);});
test('node markdown tables and text are rendered as structured safe XML',()=>{assert.match(prose('| 项目 | 值 |\n|---|---|\n| A | **B** |'),/<table>/);assert.match(prose('<script>'),/&lt;script&gt;/);});

import {contentSignature} from '../scripts/feishu-sync.mjs';
test('content checks ignore resource metadata updates but detect actual edits',()=>{
 const a='<p id="one">原文</p><img id="a" src="resource" width="10" caption="图片"/>';
 const b='<p id="two">原文</p><img id="b" src="resource" width="20" caption="图片"/>';
 assert.equal(contentSignature(a),contentSignature(b));
 assert.notEqual(contentSignature(a),contentSignature(b.replace('原文','手动修改')));
 assert.notEqual(contentSignature(a),contentSignature(b.replace('resource','changed')));
});
import {nativeOutline} from '../scripts/feishu-outline.mjs';
test('source and quote are in a shared quote container; redundant hierarchy and typed numbering are absent',()=>{
 const xml=renderProject(projectSnapshot({...project,nodes:[{id:'a',title:'Root',text:'explanation',source:{docId:'d',page:4,text:'evidence'}}]}));
 assert.match(xml,/<blockquote><p>出处：[\s\S]*<p>evidence<\/p>[\s\S]*<\/blockquote>/);
 assert.doesNotMatch(xml,/上级：|<h1>1 /);
 assert.match(prose('1. One\n2. Two'),/<li seq="auto">One/);
});
test('transparent list wrappers expose root IDs without deleting nested descendants separately',()=>{
 assert.deepEqual(topBlocks('<ol><li id="a">A<p id="body">body</p><ol><li id="child">child</li></ol></li><li id="b">B</li></ol>').map(b=>b.id),['a','b']);
});
test('native outline nests body and children, keeps independent roots, and preserves image references',()=>{
 const text=s=>({elements:[{text_run:{content:s}}]});
 const items=[{block_id:'a',block_type:3,heading1:text('Root')},{block_id:'body',block_type:2,text:text('body')},{block_id:'b',block_type:4,heading2:text('Child')},{block_id:'img',block_type:27,image:{token:'real'}},{block_id:'c',block_type:3,heading1:text('Alone')}];
 const nodes=[{id:'root',title:'Root'},{id:'child',title:'Child',parentId:'root'},{id:'alone',title:'Alone'}];
 const p=nativeOutline(items,items.map(b=>b.block_id),nodes);
 assert.deepEqual(p.children_id,['a','c']);assert.deepEqual(p.descendants[0].children,['body','b']);
 assert.equal(p.descendants[0].ordered.style.sequence,'auto');assert.equal(p.images[0].token,'real');assert.equal(p.owners.img,'child');
 assert.deepEqual(items[0].heading1,text('Root'));
});
import {FeishuSync} from '../scripts/feishu-sync.mjs';
test('comment protection blocks rebuilding and propagates read failures rather than treating them as no comments',async()=>{
 const guard=FeishuSync.prototype.protectComments;
 await assert.rejects(guard.call({cli:async()=>({items:[{comment_id:'c'}]})},'doc'),e=>e.conflict===true);
 await assert.rejects(guard.call({cli:async()=>{throw Error('network');}},'doc'),/network/);
 await guard.call({cli:async()=>({items:[],has_more:false})},'doc');
});

import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
test('readback acknowledgement preserves old baseline, rejects stale versions and retries idempotently',async()=>{
 const root=await mkdtemp(join(tmpdir(),'folio-sync-'));
 try{
  const sync=new FeishuSync({root});await sync.ready;
  sync.state.enabled=true;sync.state.projects.p={title:'P',incoming:{token:'t'},formatVersion:3};
  const dir=join(root,'p');await mkdir(dir);
  const snapshot={projectId:'p',title:'P',nodes:[{id:'n',title:'old'}],docs:[],edges:[]};
  await writeFile(join(dir,'readback-base.json'),JSON.stringify({snapshot,items:[]}));
  await writeFile(join(dir,'incoming.json'),JSON.stringify({token:'t',changes:[{id:'n',fields:{title:{base:'old',value:'new'}}}],items:[{block_id:'new'}],signature:'sig',revision:2}));
  await assert.rejects(sync.acknowledge('p','stale'),/版本已变化/);
  await assert.rejects(sync.enqueue(snapshot),/待合并/);
  await sync.acknowledge('p','t');await sync.acknowledge('p','t');
  const files=await readdir(join(dir,'history'));assert.equal(files.length,1);
  assert.equal(JSON.parse(await readFile(join(dir,'history',files[0]),'utf8')).snapshot.nodes[0].title,'old');
  assert.equal(JSON.parse(await readFile(join(dir,'readback-base.json'),'utf8')).snapshot.nodes[0].title,'new');
  assert.equal(sync.state.projects.p.incoming,undefined);
  assert.deepEqual(await sync.enqueue({...snapshot,nodes:[{id:'n',title:'new'}]}),{unchanged:true});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('network failures do not become permanent content conflicts; existing conflicts remain protected',async()=>{
 const root=await mkdtemp(join(tmpdir(),'folio-retry-'));
 try{
  await writeFile(join(root,'state.json'),JSON.stringify({enabled:true,projects:{p:{doc:'d',nodeBlocks:{},status:'conflict',message:'lookup open.feishu.cn: no such host',remoteHash:contentSignature('<p>old</p>')},real:{status:'conflict',message:'正文被修改'}}}));
  const sync=new FeishuSync({root});await sync.ready;
  assert.equal(sync.state.projects.p.status,'failed');assert.equal(sync.state.projects.real.status,'conflict');
  sync.readbackBase=async()=>({snapshot:{nodes:[]},items:[]});
  sync.fetch=async()=>{throw Error('read: operation timed out');};
  await assert.rejects(sync.pull('p'),/timed out/);assert.equal(sync.state.projects.p.status,'failed');
  sync.fetch=async()=>({content:'<p>old</p>'});
  assert.deepEqual(await sync.pull('p'),{unchanged:true});
  await assert.rejects(sync.enqueue({projectId:'real',title:'R',nodes:[],edges:[],docs:[]}),/暂停/);
 }finally{await rm(root,{recursive:true,force:true});}
});
