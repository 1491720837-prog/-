import {projectSnapshot} from './feishu-format.js';
export function createFeishuSync({list,read,apply,answerComment,onStatus}){
 let enabled=false,polling=false,commentsEnabled=false,serverManaged=false;const timers=new Map(),last=new Map(),conflicts=new Map();
 const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(s))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 async function api(path,data){const r=await fetch('/api/feishu/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error||'飞书同步失败');return j;}
 async function receive(id,choice){
  const incoming=await api('pull',{projectId:id});if(incoming.busy)return false;if(incoming.unchanged){conflicts.delete(id);return true;}
  const result=await apply(incoming,choice);
  if(result.deferred)return false;
  if(result.conflicts?.length){conflicts.set(id,result.conflicts);onStatus('飞书：有修改冲突，请点击处理');return false;}
  await api('ack',{projectId:id,token:incoming.token,keptLocal:choice==='local'});conflicts.delete(id);last.delete(id);
  if(result.count)onStatus('飞书修改已更新到画布');return true;
 }
 async function send(id){if(!enabled)return;try{
  if(!await receive(id))return;
  const s=await read(id);if(!s)return;const snapshot=projectSnapshot(s),d=await digest(snapshot);
  if(last.get(id)===d)return;const result=await api('sync',snapshot);last.set(id,d);if(!result.unchanged)onStatus('飞书：待同步');
 }catch(e){onStatus('飞书：'+e.message);}}
 // Serialize incoming merges and outgoing snapshots, including across browser tabs.
 let chain=Promise.resolve();
 function serial(fn){const next=chain.catch(()=>{}).then(()=>navigator.locks?navigator.locks.request('folio-feishu-sync',fn):fn());chain=next;return next;}
 function schedule(s){if(!enabled||serverManaged)return;clearTimeout(timers.get(s.projectId));timers.set(s.projectId,setTimeout(()=>{timers.delete(s.projectId);serial(()=>send(s.projectId));},8000));}
 async function comment(id){
  if(!enabled||!commentsEnabled||!answerComment)return;
  const job=await api('comments/next',{projectId:id});if(!job)return;
  try{onStatus('飞书评论：AI 正在回答…');const project=await read(id);if(!project)throw Error('项目未打开或已删除');
   const result=await answerComment(job,project,message=>onStatus('飞书评论：'+message));
   await api('comments/complete',{id:job.id,...result});await receive(id);onStatus('飞书评论：已处理');
  }catch(e){await api('comments/fail',{id:job.id,message:e.message});onStatus('飞书评论：'+e.message);}
 }
 async function all(){if(serverManaged)return;return serial(async()=>{for(const p of await list()){await send(p.id);try{await comment(p.id);}catch(e){onStatus('飞书评论：'+e.message);}}});}
 async function status(){const v=await api('status');serverManaged=v.serverManaged===true;enabled=v.enabled;commentsEnabled=v.comments?.enabled===true;v.projects.forEach(p=>{p.conflicts=serverManaged?(p.conflicts||[]):(conflicts.get(p.id)||[]);});return v;}
 async function enable(v){await api('configure',{enabled:v});enabled=v;if(v){last.clear();await all();}else{for(const timer of timers.values())clearTimeout(timer);timers.clear();}return status();}
 async function resolve(id,choice){if(serverManaged)return api('resolve',{projectId:id,choice});return serial(async()=>{if(await receive(id,choice))await send(id);});}
 async function poll(){if(polling||!enabled)return;polling=true;try{await all();}finally{polling=false;}}
 async function start(){try{const s=await status();if(s.enabled)await all();}catch(e){onStatus('飞书：未连接');}setInterval(()=>poll().catch(()=>{}),15000);window.addEventListener('focus',()=>poll().catch(()=>{}));}
 async function configureComments(enabled){await api('comments/configure',{enabled});commentsEnabled=enabled;return status();}
 async function retryComment(id){await api('comments/retry',{id});return all();}
 async function disablePreference(id){return api('comments/preference-disable',{id});}
 return {status,enable,schedule,all,start,resolve,configureComments,retryComment,disablePreference};
}
