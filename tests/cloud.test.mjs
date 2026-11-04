import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CloudStore} from '../scripts/cloud-store.mjs';
import {CloudAuth,passwordHash} from '../scripts/cloud-auth.mjs';
import {Devices} from '../scripts/cloud-devices.mjs';
import {CloudAI} from '../scripts/cloud-ai.mjs';
import {CloudWorker} from '../scripts/cloud-worker.mjs';
import {createCloudServer} from '../scripts/cloud-server.mjs';
import {createDemo} from '../dist/demo.js';
import net from 'node:net';
import {PDFDocument,StandardFonts} from 'pdf-lib';

async function temporary(fn){const root=await mkdtemp(join(tmpdir(),'folio-cloud-test-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('cloud project writes are versioned, immutable, deduplicated and reject stale editors',()=>temporary(async root=>{
  const store=new CloudStore(root),p=createDemo();p.projectId='test';p.config={apiKey:'must-not-leak'};
  p.nodes[0].image='data:image/png;base64,AA==';
  const first=await store.put(p);const a=await store.get('test'),b=await store.get('test');
  a.project.nodes[0].title='第一台电脑';const second=await store.put(a.project,a.revision);
  b.project.nodes[0].title='另一台电脑';await assert.rejects(store.put(b.project,b.revision),e=>e.status===409);
  assert.equal((await store.get('test')).project.nodes[0].title,'第一台电脑');
  assert.notEqual(first.revision,second.revision);assert.equal((await store.history('test')).length,2);
  assert.equal((await store.get('test',first.revision)).project.nodes[0].title,p.nodes[0].title);
  assert.equal((await store.get('test')).project.config,undefined);
  assert.equal((await readdir(join(root,'blobs'))).length,1);
  const restarted=new CloudStore(root);assert.equal((await restarted.get('test')).revision,second.revision);
  await assert.rejects(store.get('../../x'));
}));
test('cloud auth refuses public HTTP, weak secrets, forged cookies and cross-origin writes',()=>{
  const config={origin:'https://folio.example',secret:'a'.repeat(40),password:passwordHash('test-password')};
  const auth=new CloudAuth(config);assert.throws(()=>new CloudAuth({...config,origin:'http://public.example'}));
  assert.throws(()=>new CloudAuth({...config,secret:'short'}));assert.throws(()=>auth.login('wrong'));
  const cookie=auth.login('test-password');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));
  assert.ok(auth.authenticated({headers:{cookie:cookie.split(';')[0]}}));assert.equal(auth.authenticated({headers:{cookie:'folio_session=fake.signature'}}),false);
  assert.throws(()=>auth.checkOrigin({headers:{origin:'https://evil.example'}}));
});

test('open-access mode skips password and treats every request as authenticated',()=>{
  const auth=new CloudAuth({origin:'https://folio.example',openAccess:true});
  assert.equal(auth.authenticated({headers:{}}),true);
  assert.equal(auth.authenticated({headers:{cookie:'folio_session=fake.signature'}}),true);
  assert.throws(()=>new CloudAuth({origin:'http://public.example',openAccess:true}));
});

test('loopback origin is accepted for local access even when public URL is a tunnel host',()=>{
  const auth=new CloudAuth({origin:'https://folio.example',secret:'a'.repeat(40),password:passwordHash('pw')});
  // 本机回环来源放行（固定 http://127.0.0.1:4319 本地访问）
  assert.doesNotThrow(()=>auth.checkOrigin({headers:{origin:'http://127.0.0.1:4319'}}));
  assert.doesNotThrow(()=>auth.checkOrigin({headers:{origin:'http://localhost:4319'}}));
  // 公网来源必须严格匹配
  assert.doesNotThrow(()=>auth.checkOrigin({headers:{origin:'https://folio.example'}}));
  assert.throws(()=>auth.checkOrigin({headers:{origin:'https://evil.example'}}));
});
test('paired devices have scoped credentials, durable jobs, revocation and idempotent completion',()=>temporary(async root=>{
  let now=100;const store=new CloudStore(root),devices=new Devices(store,{now:()=>now}),pair=await devices.pair();
  const a=await devices.register(pair.code,'Mac A');await assert.rejects(devices.register(pair.code,'Mac B'));
  assert.equal(await devices.identify(a.token),a.id);await devices.heartbeat(a.id,{codex:true,translation:true,models:[]});
  const j=await devices.create(a.id,'codex',{messages:[]});assert.equal((await devices.claim(a.id)).id,j.id);assert.equal(await devices.claim(a.id),null);
  await assert.rejects(devices.finish('other',j.id,{content:'bad'}));await devices.finish(a.id,j.id,{content:'answer'});await devices.finish(a.id,j.id,{content:'duplicate'});
  assert.equal((await devices.result(j.id)).content,'answer');
  const restored=new Devices(store,{now:()=>now});assert.equal((await restored.result(j.id)).content,'answer');
  assert.ok(!(await readFile(join(root,'devices.json'),'utf8')).includes(a.token));
  now+=50000;await assert.rejects(devices.create(a.id,'codex',{}),/不在线/);
  await devices.revoke(a.id);await assert.rejects(devices.identify(a.token));
}));
test('API reading uses actual page tools and rejects a model outside the allowlist',async()=>{
  const calls=[],responses=[{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'one',type:'function',function:{name:'read_document_page',arguments:JSON.stringify({docId:'d',side:'en',page:2})}}]}}]},{model:'example-model',choices:[{message:{content:'有依据的解释 [论文，原文第 2 页]'}}]}];
  const catalog={data:[{id:'example-model',name:'Example',context_length:1000,supported_parameters:['tools'],architecture:{input_modalities:['text']}}]};
  const ai=new CloudAI({devices:{},env:{FOLIO_AI_BASE_URL:'https://provider.example/v1',FOLIO_AI_MODEL:'example-model'},request:async(url,init)=>{if(String(url).endsWith('/models'))return {ok:true,json:async()=>catalog};calls.push(JSON.parse(init.body));return {ok:true,json:async()=>responses.shift()};}});
  const r=await ai.apiAnswer({messages:[{role:'user',content:'解释'}],literature:{pages:[{docId:'d',name:'论文',side:'en',page:2,text:'ACTUAL EVIDENCE'}]}});
  assert.equal(r.sources[0].page,2);assert.ok(calls[1].messages.some(m=>m.role==='tool'&&m.content.includes('ACTUAL EVIDENCE')));
  await assert.rejects(ai.completion({model:'not-allowed'}),/允许列表/);
});
test('a model without tool support cannot answer from memory alone',async()=>{
  let chats=0;
  const ai=new CloudAI({devices:{},env:{FOLIO_AI_BASE_URL:'https://openrouter.ai/api/v1',FOLIO_AI_MODEL:'no-tools',FOLIO_AI_MODELS:'no-tools'},request:async(url,init)=>{
    if(String(url).endsWith('/models'))return {ok:true,json:async()=>({data:[{id:'no-tools',supported_parameters:['temperature']}]})};
    chats++;return {ok:true,json:async()=>({choices:[{message:{content:'没有检索的回答'}}]})};
  }});
  await assert.rejects(ai.apiAnswer({messages:[{role:'user',content:'问'}],literature:{pages:[{docId:'d',name:'p',side:'en',page:1,text:'x'}]}}),/工具调用/);
  assert.equal(chats,0);
});
test('an unreachable model catalog never blocks a working model',async()=>{
  const ai=new CloudAI({devices:{},env:{FOLIO_AI_BASE_URL:'https://openrouter.ai/api/v1',FOLIO_AI_MODEL:'any',FOLIO_AI_MODELS:'any'},request:async(url)=>{
    if(String(url).endsWith('/models'))throw Error('offline');
    return {ok:true,json:async()=>({choices:[{message:{content:'ok'}}]})};
  }});
  const r=await ai.apiAnswer({messages:[{role:'user',content:'问'}],literature:{pages:[{docId:'d',name:'p',side:'en',page:1,text:'x'}]}});
  assert.equal(r.content,'ok');
});
test('OpenRouter requests keep user material out of training unless allowed',async()=>{
  const bodies=[];
  const env={FOLIO_AI_BASE_URL:'https://openrouter.ai/api/v1',FOLIO_AI_MODEL:'m',FOLIO_AI_MODELS:'m'};
  const request=async(url,init)=>{bodies.push(JSON.parse(init.body));return {ok:true,json:async()=>({choices:[{message:{content:'x'}}]})}};
  await new CloudAI({devices:{},env,request}).completion({model:'m',messages:[]});
  assert.equal(bodies[0].provider.data_collection,'deny');
  await new CloudAI({devices:{},env:{...env,FOLIO_AI_DATA_COLLECTION:'allow'},request}).completion({model:'m',messages:[]});
  assert.equal(bodies[1].provider,undefined);
});
test('server extracts paired PDF text without a browser',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Server-side reading evidence',{font});const data=Buffer.from(await pdf.save()).toString('base64');
  const p=createDemo();p.docs=[{id:'pdf',name:'Paper',type:'pdf',pages:1,data,translationPDF:{id:'zh',name:'Translation',type:'pdf',pages:1,data}}];p.activeDoc='pdf';p.nodes=[{id:'n',title:'Question',text:'',source:{docId:'pdf',page:1}}];
  const ai=new CloudAI({devices:{}}),r=await ai.corpus(p,p.nodes[0]);assert.equal(r.pages.length,2);assert.ok(r.pages.every(p=>p.text.includes('Server-side reading evidence')));assert.equal(r.pages[1].side,'zh');
});
test('comment routing falls back to API after a Mac disconnects, only when enabled',async()=>{
  const p=createDemo(),job={nodeId:p.nodes[0].id,question:'解释一下'},settings={commentProvider:'codex',commentDevice:'mac',apiFallback:true};let calls=0;
  const ai=new CloudAI({devices:{list:async()=>[{id:'mac',online:true,capabilities:{codex:true}}],create:async()=>{throw Error('disconnected during dispatch');}}});
  ai.corpus=async()=>({chain:[p.nodes[0]],pages:[]});ai.apiAnswer=async()=>{calls++;return {content:JSON.stringify({action:'reply',answer:'answer',category:'解释'}),provider:'api',model:'fallback',sources:[],trace:[]};};
  assert.equal((await ai.answerComment(job,p,settings)).model,'fallback');assert.equal(calls,1);
  await assert.rejects(ai.answerComment(job,p,{...settings,apiFallback:false}),/disconnected/);assert.equal(calls,1);
});
test('background worker answers and commits Feishu edits without any browser, ACK after persistence',()=>temporary(async root=>{
  const store=new CloudStore(root),p=createDemo();p.projectId='test';await store.put(p);const original=p.nodes[0].text;let pending=false,ack=false,answered=false;
  const sync={ready:Promise.resolve(),state:{enabled:true},pending:new Map(),running:false,
    pull:async()=>pending?{token:'receipt',changes:[{id:p.nodes[0].id,fields:{text:{base:original,value:'云端后台已更新'}}}]}:{unchanged:true},enqueue:async()=>{},
    acknowledge:async()=>{assert.equal((await store.get('test')).project.nodes[0].text,'云端后台已更新');ack=true;pending=false;}};
  const comments={ready:Promise.resolve(),next:async()=>({id:'c:r',nodeId:p.nodes[0].id}),complete:async()=>{pending=true;},afterAck:async()=>{assert.ok(ack);answered=true;},fail:async()=>{throw Error('should not fail');}};
  const worker=new CloudWorker({store,sync,comments,devices:{ready:Promise.resolve(),state:{jobs:{}}},ai:{answerComment:async()=>({plan:{action:'replace'}})}});
  await worker.tick();assert.ok(answered);assert.equal((await store.history('test')).length,2);
}));
test('completed translations attach to their original project, never replace an existing translation or changed source',()=>temporary(async root=>{
  const store=new CloudStore(root),devices=new Devices(store),pair=await devices.pair(),mac=await devices.register(pair.code,'Mac');await devices.heartbeat(mac.id,{translation:true});
  const pdf=await PDFDocument.create();pdf.addPage();const data=Buffer.from(await pdf.save()).toString('base64');
  const project=createDemo();project.projectId='translation-target';project.nodes=[];project.edges=[];project.docs=[{id:'paper',name:'Paper',type:'pdf',pages:1,data}];project.activeDoc='paper';await store.put(project);
  const worker=new CloudWorker({store,devices});
  const finish=async payload=>{const j=await devices.create(mac.id,'translation',payload);await devices.claim(mac.id);await devices.finish(mac.id,j.id,{projectId:payload.projectId,docId:'paper',name:'Chinese',pages:1,data,report:{figures:0}});return j;};
  const first=await finish({projectId:project.projectId,docId:'paper',data});await worker.integrateTranslations();
  assert.equal((await store.get(project.projectId)).project.docs[0].translationPDF.id,'translation-'+first.id);
  const again=await finish({projectId:project.projectId,docId:'paper',data});await worker.integrateTranslations();
  assert.equal((await store.get(project.projectId)).project.docs[0].translationPDF.id,'translation-'+first.id);
  const other=structuredClone(project);other.projectId='changed-source';await store.put(other);const pending=await finish({projectId:other.projectId,docId:'paper',data});
  const current=await store.get(other.projectId);const updated=await PDFDocument.create();updated.addPage([200,200]);current.project.docs[0].data=Buffer.from(await updated.save()).toString('base64');await store.put(current.project,current.revision);
  await worker.integrateTranslations();assert.equal((await store.get(other.projectId)).project.docs[0].translationPDF,undefined);
  assert.equal((await devices.result(pending.id)).pages,1);assert.equal((await devices.result(again.id)).pages,1);
}));
test('HTTP routes require login and origin, and only registered devices can claim tasks',()=>temporary(async root=>{
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const origin='http://127.0.0.1:'+port;
  const env={FOLIO_PUBLIC_URL:origin,FOLIO_DATA_DIR:root,FOLIO_SESSION_SECRET:'test-secret-'.repeat(4),FOLIO_PASSWORD_HASH:passwordHash('test-password')};
  const app=await createCloudServer({env});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const url='http://127.0.0.1:'+app.server.address().port;
  const headers={Origin:origin,'Content-Type':'application/json'};
  try{
    let r=await fetch(url+'/api/cloud/projects',{headers});assert.equal(r.status,401);
    r=await fetch(url+'/api/login',{method:'POST',headers,body:JSON.stringify({password:'test-password'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
    const logged={...headers,Cookie:cookie};r=await fetch(url+'/',{headers:logged});assert.ok((await r.text()).includes('name="folio-mode" content="cloud"'));
    r=await fetch(url+'/api/cloud/pair',{method:'POST',headers:{...logged,Origin:'https://other.example'},body:'{}'});assert.equal(r.status,403);
    r=await fetch(url+'/api/device/claim',{method:'POST',headers:{Host:'127.0.0.1','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);
    const p=createDemo();p.projectId='test';r=await fetch(url+'/api/cloud/projects/test',{method:'PUT',headers:logged,body:JSON.stringify({project:p,revision:null})});assert.equal(r.status,200);
    r=await fetch(url+'/api/cloud/projects/test',{method:'PUT',headers:logged,body:JSON.stringify({project:p,revision:null})});assert.equal(r.status,409);
    r=await fetch(url+'/api/feishu/status',{headers:logged});assert.equal((await r.json()).serverManaged,true);
  }finally{await new Promise(r=>app.server.close(r));}
}));
