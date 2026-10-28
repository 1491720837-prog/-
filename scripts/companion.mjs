import {homedir,hostname} from 'node:os';
import {join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {atomicJSON,readJSON} from './cloud-store.mjs';
import {CodexBridge} from './codex-bridge.mjs';
import {TranslationJobs} from './translation-jobs.mjs';

try{process.loadEnvFile('.env.local');}catch{}
const root=process.env.FOLIO_COMPANION_DATA||join(homedir(),'.folio-companion');await mkdir(root,{recursive:true,mode:0o700});
const file=join(root,'connection.json');let connection=await readJSON(file,null);
if(process.argv.includes('--pair')){
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  try{
    const origin=new URL((await terminal.question('在线工作台网址：https://…\n> ')).trim()).origin;
    if(!origin.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))throw Error('必须是 HTTPS 网站');
    const code=(await terminal.question('在线版「在线与本机」里生成的五分钟配对码：\n> ')).trim();
    const response=await fetch(origin+'/api/device/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,name:hostname()})});
    const result=await response.json();if(!response.ok)throw Error(result.error);connection={origin,...result};await atomicJSON(file,connection);console.log('配对完成。Codex 登录信息仅保留在这台电脑。');
  }finally{terminal.close();}
}
if(!connection)throw Error('请先运行 npm run companion:pair');
const codex=new CodexBridge(),translations=new TranslationJobs({codex,root:join(root,'translations')}),active=new Map();
let stopping=false;
function stop(){stopping=true;for(const c of active.values())c.abort();codex.stop();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
async function api(path,payload){const r=await fetch(connection.origin+'/api/device/'+path,{method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(data.error||'本机助手连接失败');return data;}
async function execute(job){
  const receipt=join(root,'receipt-'+job.id+'.json');let completed=await readJSON(receipt,null);
  if(completed){await api('finish',{id:job.id,...completed});return;}
  const controller=new AbortController();active.set(job.id,controller);
  try{
    const payload=(await api('payload',{id:job.id})).payload;let result;
    if(job.type==='codex')result={...await codex.answer(payload,{signal:controller.signal}),provider:'codex'};
    else if(job.type==='convert')result=await translations.convert(payload);
    else if(job.type==='translation'){
      const mapping=join(root,'translation-'+job.id+'.json');let local=await readJSON(mapping,null);
      if(!local){local=await translations.create(payload);await atomicJSON(mapping,{id:local.id});}
      let status=await translations.status(local.id);
      if(status.status==='interrupted')status=await translations.retry(local.id);
      while(status.status!=='complete'){
        if(controller.signal.aborted){await translations.cancel(local.id);throw Error('已取消翻译');}
        if(['failed','cancelled','interrupted'].includes(status.status))throw Error(status.message);
        await api('progress',{id:job.id,message:status.message}).catch(()=>{});await new Promise(r=>setTimeout(r,3000));status=await translations.status(local.id);
      }
      result=await translations.result(local.id);
    }else throw Error('不支持的本机任务');
    completed={result};
  }catch(e){completed={error:e.message};}
  finally{active.delete(job.id);}
  await atomicJSON(receipt,completed);await api('finish',{id:job.id,...completed});
}
let resumed=false,capabilities,lastCapabilities=0;
console.log('Folio 本机助手已启动。退出：Ctrl+C。连接：'+connection.origin);
while(!stopping){
  try{
    if(!capabilities||Date.now()-lastCapabilities>60000){const status=await codex.status();let translation=false;try{await translations.runtime();translation=process.platform==='darwin'&&status.authenticated;}catch{}capabilities={codex:status.authenticated,models:status.models,translation};lastCapabilities=Date.now();}
    const heartbeat=await api('heartbeat',{capabilities,active:[...active.keys()]});
    for(const id of heartbeat.cancelled||[])active.get(id)?.abort();
    if(!resumed){const jobs=await api('resume',{});for(const j of jobs)if(!active.has(j.id))execute(j).catch(e=>console.error('任务回传失败：'+e.message));resumed=true;}
    if(active.size<3){const job=await api('claim',{});if(job&&!active.has(job.id))execute(job).catch(e=>console.error('任务回传失败：'+e.message));}
  }catch(e){console.error('连接待恢复：'+e.message);resumed=false;}
  await new Promise(r=>setTimeout(r,5000));
}
for(const c of active.values())c.abort();codex.stop();
