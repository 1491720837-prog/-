import http from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CloudStore,readJSON,atomicJSON,validId} from './cloud-store.mjs';
import {CloudAuth} from './cloud-auth.mjs';
import {Devices} from './cloud-devices.mjs';
import {CloudAI} from './cloud-ai.mjs';
import {CloudWorker} from './cloud-worker.mjs';
import {FeishuSync} from './feishu-sync.mjs';
import {FeishuComments} from './feishu-comments.mjs';
import {exportSyncBundle,importSyncBundle} from './migration.mjs';
import {PodcastJobs,podcastRoute} from './podcast-jobs.mjs';
import {captureImages} from './capture-images.mjs';

export async function createCloudServer({env=process.env,feishu,comments:commentService,request=fetch}={}){
  const origin=env.FOLIO_PUBLIC_URL,openAccess=env.FOLIO_OPEN_ACCESS==='1'||env.FOLIO_OPEN_ACCESS==='true',auth=new CloudAuth({origin,secret:env.FOLIO_SESSION_SECRET,password:env.FOLIO_PASSWORD_HASH,openAccess});
  if(!env.FOLIO_DATA_DIR)throw Error('必须指定持久化目录 FOLIO_DATA_DIR');
  const store=new CloudStore(resolve(env.FOLIO_DATA_DIR)),devices=new Devices(store),ai=new CloudAI({devices,env,request});
  const sync=feishu||new FeishuSync({root:join(store.root,'feishu-sync')}),comments=commentService||new FeishuComments(sync);
  const podcasts=new PodcastJobs({root:join(store.root,'podcast-jobs')});
  const worker=new CloudWorker({store,devices,ai,sync,comments});await Promise.all([store.ready,devices.ready,worker.ready,sync.ready,comments.ready]);
  const root=fileURLToPath(new URL('../dist/',import.meta.url)).replace(/[\\/]$/,''),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.pdf':'application/pdf'};
  const server=http.createServer(async(req,res)=>{
    const json=(status,value)=>{if(res.headersSent)return res.end();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    const body=async(limit=1_000_000)=>{
      if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('文件过大'),{status:413});chunks.push(chunk);}
      try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(Error('JSON 格式无效'),{status:400});}
    };
    try{
      const url=new URL(req.url,origin),path=url.pathname;
      if(path==='/healthz'&&req.method==='GET')return json(200,{ok:true});
      if(req.headers.host!==new URL(origin).host)return json(403,{error:'Host not allowed'});
      if(path.startsWith('/api/device/')){
        if(req.method!=='POST')return json(405,{error:'POST required'});
        if(req.headers.origin)return json(403,{error:'本机助手接口不接受浏览器调用'});
        if(path==='/api/device/register'){const b=await body(3000);return json(200,await devices.register(b.code,b.name));}
        const id=await devices.identify(req.headers.authorization?.replace(/^Bearer /,'')),b=await body(100_000_000);
        if(['payload','progress','finish'].includes(path.split('/').at(-1))){const j=await devices.job(b.id);if(!j||j.deviceId!==id)return json(404,{error:'任务不存在'});}
        if(path==='/api/device/heartbeat'){await devices.heartbeat(id,b.capabilities);return json(200,{cancelled:(b.active||[]).filter(j=>devices.state.jobs[j]?.status==='failed')});}
        if(path==='/api/device/claim')return json(200,await devices.claim(id));
        if(path==='/api/device/resume')return json(200,Object.values(devices.state.jobs).filter(j=>j.deviceId===id&&j.status==='running'));
        if(path==='/api/device/payload')return json(200,{payload:await devices.payload(b.id)});
        if(path==='/api/device/progress')return json(200,await devices.progress(id,b.id,b.message));
        if(path==='/api/device/finish')return json(200,await devices.finish(id,b.id,b.result,b.error));
        return json(404,{error:'Not found'});
      }
      if(!['GET','HEAD'].includes(req.method))auth.checkOrigin(req);
      if(path==='/api/login'&&req.method==='POST'){const b=await body(3000);res.setHeader('Set-Cookie',auth.login(b.password));return json(200,{ok:true});}
      const publicFiles=['/login.html','/cloud-login.js','/cloud-page.css'];
      if(!publicFiles.includes(path)&&!auth.authenticated(req)){
        if(path.startsWith('/api/'))return json(401,{error:'登录已过期，请重新登录'});
        res.writeHead(303,{Location:'/login.html'});return res.end();
      }
      if(path==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie',auth.cookie('',0));return json(200,{ok:true});}
      if(path.startsWith('/api/podcasts/'))return json(200,await podcastRoute(podcasts,path,req.method,req.method==='POST'?await body(20000):{},url.searchParams));
      if(path==='/api/capture/images'&&req.method==='POST')return json(200,await captureImages((await body(100000)).urls));
      if(path==='/api/status')return json(200,{cloud:true,local:false,configured:ai.configured(),model:env.FOLIO_AI_MODEL||''});
      if(path==='/api/cloud/status')return json(200,{devices:await devices.list(),settings:worker.settings,worker:{running:worker.running,lastRun:worker.lastRun,errors:worker.errors},apiConfigured:ai.configured(),apiModels:(env.FOLIO_AI_MODELS||env.FOLIO_AI_MODEL||'').split(',').filter(Boolean)});
      if(path==='/api/cloud/pair'&&req.method==='POST')return json(200,await devices.pair());
      if(path==='/api/cloud/revoke'&&req.method==='POST'){await devices.revoke((await body()).id);return json(200,{ok:true});}
      if(path==='/api/cloud/settings'&&req.method==='POST')return json(200,await worker.configure(await body()));
      if(path==='/api/cloud/projects'&&req.method==='GET')return json(200,await store.list());
      const project=path.match(/^\/api\/cloud\/projects\/([^/]+)(\/history)?$/);
      if(project){const id=validId(project[1]);
        if(req.method==='GET'){const result=project[2]?await store.history(id):await store.get(id,url.searchParams.get('revision'));return result?json(200,result):json(404,{error:'项目不存在'});}
        if(req.method==='PUT'&&!project[2]){const b=await body(320_000_000);if(b.project?.projectId!==id)return json(400,{error:'项目编号不匹配'});return json(200,await store.put(b.project,b.revision||null));}
      }
      if(path==='/api/migration/feishu'&&req.method==='GET')return json(200,await exportSyncBundle(sync,comments));
      if(path==='/api/migration/feishu'&&req.method==='POST')return json(200,await importSyncBundle(sync,comments,store,await body(320_000_000)));
      if(path.startsWith('/api/feishu/')){
        if(path==='/api/feishu/status'){
          const status=await sync.status();for(const p of status.projects){if(worker.errors[p.id]){p.message=worker.errors[p.id].message;p.conflicts=worker.errors[p.id].conflicts||[];}}
          return json(200,{...status,comments:await comments.status(),serverManaged:true});
        }
        if(req.method!=='POST')return json(405,{error:'POST required'});const b=await body();
        if(path==='/api/feishu/configure')return json(200,await sync.configure(b.enabled));
        if(path==='/api/feishu/comments/configure')return json(200,await comments.configure(b.enabled));
        if(path==='/api/feishu/comments/retry')return json(200,await comments.retry(b.id));
        if(path==='/api/feishu/comments/preference-disable')return json(200,await comments.disablePreference(b.id));
        if(path==='/api/feishu/resolve'){if(worker.running)return json(409,{error:'后台处理进行中，请稍后重试'});if(!['local','remote'].includes(b.choice))return json(400,{error:'请选择版本'});return json(200,{ok:await worker.receive(b.projectId,b.choice)});}
        return json(409,{error:'在线版由后台处理同步，页面不再直接处理评论任务'});
      }
      const deviceId=req.headers['x-folio-device'];
      if(path==='/api/codex/status'){
        const d=(await devices.list()).find(d=>d.id===deviceId&&d.online&&d.capabilities.codex);
        return json(200,{available:!!d,authenticated:!!d,models:d?.capabilities.models||[],reasoningEffort:'medium',error:d?null:'请在「在线与本机」连接当前 Mac，或改用 API'});
      }
      if(path==='/api/codex/chat'&&req.method==='POST'){
        const b=await body(45_000_000),j=await devices.create(deviceId,'codex',b),controller=new AbortController();
        res.on('close',()=>{if(!res.writableEnded){controller.abort();devices.cancel(j.id).catch(()=>{});}});
        res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
        const emit=e=>{if(!res.destroyed)res.write(JSON.stringify(e)+'\n');},timer=setInterval(()=>emit({type:'heartbeat'}),10000);
        try{emit({type:'status',message:'已发送到所选 Mac 的 Codex'});emit({type:'done',result:await devices.wait(j.id,controller.signal)});}catch(e){emit({type:'error',message:e.message});}finally{clearInterval(timer);res.end();}return;
      }
      if(path==='/api/chat'&&req.method==='POST'){const b=await body(45_000_000);if(!Array.isArray(b.messages)||b.messages.length>100)return json(400,{error:'messages required'});const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});return json(200,b.literature?await ai.apiAnswer(b,controller.signal):await ai.completion({messages:b.messages,model:b.model},controller.signal));}
      if(path==='/api/translation/convert'&&req.method==='POST'){const j=await devices.create(deviceId,'convert',await body(85_000_000));return json(200,await devices.wait(j.id));}
      if(path==='/api/translation/jobs'&&req.method==='POST'){
        const b=await body(85_000_000),record=await store.get(b.projectId),d=record?.project.docs.find(d=>d.id===b.docId);
        if(!d||d.data!==b.data)return json(409,{error:'请先将该文献保存到云端'});
        const j=await devices.create(deviceId,'translation',b);return json(202,{...j,projectId:b.projectId,docId:b.docId,message:'已发送到所选 Mac；页面关闭后仍可继续处理'});
      }
      const translation=path.match(/^\/api\/translation\/jobs\/([a-f0-9-]{36})(?:\/(result|cancel|retry))?$/);
      if(translation){const j=await devices.job(translation[1]);if(!j||j.type!=='translation')return json(404,{error:'翻译任务不存在'});
        if(translation[2]==='cancel'&&req.method==='POST')return json(200,await devices.cancel(j.id));
        if(translation[2]==='retry'&&req.method==='POST'){const next=await devices.create(deviceId,'translation',await devices.payload(j.id));return json(202,next);}
        if(req.method==='GET'&&translation[2]==='result'){await worker.integrateTranslations();const applied=await readJSON(join(store.root,'translation-applied-'+j.id+'.json'),null);return json(200,{...await devices.result(j.id),cloudSaved:applied?.ok===true,cloudMessage:applied?.skipped});}
        if(req.method==='GET'&&!translation[2])return json(200,{...j,status:j.status==='done'?'complete':j.status,message:j.error||j.message||'等待本机助手处理'});
      }
      if(path.startsWith('/api/'))return json(404,{error:'Not found'});
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'GET required'});
      const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))return json(403,{error:'Forbidden'});
      if(!(await stat(file)).isFile())return json(404,{error:'Not found'});
      let content=await readFile(file);if(extname(file)==='.html')content=content.toString().replace(/<head>/i,'<head><meta name="folio-mode" content="cloud">');
      res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(req.method==='HEAD'?undefined:content);
    }catch(e){json(e.status||(e.code==='ENOENT'?404:500),{error:e.code==='ENOENT'?'Not found':e.message});}
  });
  server.requestTimeout=360000;server.headersTimeout=15000;
  server.on('close',()=>{podcasts.stop();worker.stop();});
  return {server,store,devices,worker,sync,comments};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.loadEnvFile('.env.cloud');}catch{}
  // 临时隧道网址会变化：隧道同步脚本把最新网址写到 ~/.local/folio/current-url，
  // 这里优先采用它作为 FOLIO_PUBLIC_URL，避免每次开机都要手改 .env.cloud。
  try{const u=(await readFile(process.env.HOME+'/.local/folio/current-url','utf8')).trim();if(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(u))process.env.FOLIO_PUBLIC_URL=u;}catch{}
  const app=await createCloudServer();app.worker.start();
  app.server.listen(Number(process.env.PORT||4319),process.env.HOST||'0.0.0.0',()=>console.log('Folio 在线服务已启动；项目保存在持久化目录。'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.worker.stop();app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),30000).unref();});
}
