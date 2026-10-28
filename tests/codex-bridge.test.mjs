import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import {CodexBridge} from '../scripts/codex-bridge.mjs';
function fakeCodex({stall=false}={}) {
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();const calls=[];let thread=0;
 const send=value=>child.stdout.write(JSON.stringify(value)+'\n');
 child.stdin=new Writable({write(chunk,encoding,done){const m=JSON.parse(chunk.toString());calls.push(m);
 queueMicrotask(()=>{
  if(m.method==='initialize')send({id:m.id,result:{}});
  if(m.method==='account/read')send({id:m.id,result:{account:{type:'chatgpt'}}});
  if(m.method==='model/list')send({id:m.id,result:{data:[{model:'test-model',displayName:'Test',isDefault:true,hidden:false}]}});
  if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'+(++thread)}}});
  if(m.method==='turn/start') {const id=m.params.threadId;send({id:m.id,result:{turn:{id:'turn-'+id}}});send({method:'turn/started',params:{threadId:id,turn:{id:'turn-'+id}}});if(!stall)send({method:'item/tool/call',id:900,params:{threadId:id,turnId:'turn-'+id,tool:'read_document_page',arguments:{docId:'doc',side:'en',page:6}}});}
  if(m.id===900 && m.result){assert.match(m.result.contentItems[0].text,/ORCHID/);send({method:'item/completed',params:{threadId:'t1',item:{id:'final',type:'agentMessage',phase:'final_answer',text:'ORCHID，第 6 页。'}}});send({method:'turn/completed',params:{threadId:'t1',turn:{id:'turn-t1',status:'completed',items:[]}}});}
  if(['turn/interrupt','thread/unsubscribe'].includes(m.method))send({id:m.id,result:{}});
 });done();}});
 child.kill=()=>{child.stdin.end();child.stdout.end();child.stderr.end();};return {child,calls};
}
const payload={messages:[{role:'user',content:'marker?'}],literature:{pages:[{docId:'doc',name:'Test',page:6,side:'en',text:'ORCHID'}]}};
test('Codex bridge initializes, supplies scoped tools, returns final answer and audit evidence',async()=>{
 const fake=fakeCodex(),b=new CodexBridge({executable:'fake',spawnProcess:()=>fake.child});
 try{const events=[],result=await b.answer(payload,{emit:e=>events.push(e)});assert.match(result.content,/ORCHID/);assert.equal(result.reasoningEffort,"medium");assert.equal(fake.calls.find(m=>m.method==="turn/start").params.effort,result.reasoningEffort);assert.equal(result.sources[0].page,6);assert.equal(result.trace[0].tool,'read_document_page');
 const start=fake.calls.find(m=>m.method==='thread/start');assert.equal(start.params.ephemeral,true);assert.equal(start.params.sandbox,'read-only');assert.equal(start.params.dynamicTools.length,2);assert.ok(events.some(e=>e.type==='status'));assert.equal(b.jobs.size,0);
 }finally{b.stop();}
});
test('cancellation interrupts the turn, clears the job, and never returns a completed answer',async()=>{
 const fake=fakeCodex({stall:true}),b=new CodexBridge({executable:'fake',spawnProcess:()=>fake.child}),controller=new AbortController();
 try{const pending=b.answer(payload,{signal:controller.signal});const rejected=assert.rejects(pending,/取消/);while(!fake.calls.some(m=>m.method==='turn/start'))await new Promise(r=>setImmediate(r));controller.abort();await rejected;await new Promise(r=>setImmediate(r));assert.ok(fake.calls.some(m=>m.method==='turn/interrupt'));assert.equal(b.jobs.size,0);assert.equal(b.inFlight,0);}finally{b.stop();}
});
test('invalid inputs fail before model execution',async()=>{const b=new CodexBridge({spawnProcess:()=>{throw Error('must not spawn');}});await assert.rejects(b.answer({messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.com/private'}}]}]}),/不支持/);});
