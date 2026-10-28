import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {atomicJSON,readJSON,digest,validId} from './cloud-store.mjs';

export class Devices {
  constructor(store,{now=Date.now}={}){this.store=store;this.now=now;this.path=join(store.root,'devices.json');this.chain=Promise.resolve();this.ready=store.ready.then(async()=>{this.state=await readJSON(this.path,{devices:{},pairs:{},jobs:{}});});}
  serial(fn){const next=this.chain.catch(()=>{}).then(async()=>{await this.ready;const result=await fn();await atomicJSON(this.path,this.state);return result;});this.chain=next;return next;}
  async list(){await this.ready;return Object.values(this.state.devices).map(({tokenHash,...d})=>({...d,online:!d.revoked&&this.now()-d.seen<45000}));}
  pair(){return this.serial(()=>{const code=randomBytes(18).toString('base64url');this.state.pairs[digest(code)]={expires:this.now()+300000};return {code,expires:this.now()+300000};});}
  register(code,name){return this.serial(()=>{const key=digest(String(code)),pair=this.state.pairs[key];if(!pair||pair.expires<this.now())throw Error('配对码无效或已过期');delete this.state.pairs[key];const token=randomBytes(32).toString('base64url'),id=randomUUID();this.state.devices[id]={id,name:String(name||'Mac').slice(0,100),tokenHash:digest(token),seen:0,capabilities:{}};return {id,token};});}
  async identify(token){await this.ready;const d=Object.values(this.state.devices).find(d=>!d.revoked&&d.tokenHash===digest(String(token)));if(!d){const e=Error('本机助手未配对或已被断开');e.status=401;throw e;}return d.id;}
  revoke(id){return this.serial(()=>{const d=this.state.devices[id];if(!d)throw Error('设备不存在');d.revoked=true;for(const j of Object.values(this.state.jobs))if(j.deviceId===id&&!['done','failed'].includes(j.status)){j.status='failed';j.error='设备连接已撤销';}});}
  heartbeat(id,capabilities){return this.serial(()=>{const d=this.state.devices[id];if(!d||d.revoked)throw Error('设备已断开');d.seen=this.now();d.capabilities={codex:capabilities?.codex===true,translation:capabilities?.translation===true,models:Array.isArray(capabilities?.models)?capabilities.models.slice(0,100):[]};return {ok:true};});}
  async select(id,capability){const devices=await this.list();const d=devices.find(d=>d.id===id&&d.online&&d.capabilities[capability]);if(!d){const e=Error(capability==='translation'?'所选 Mac 不在线或未安装完整翻译依赖。请启动本机助手。':'所选 Mac 不在线或 Codex 未登录。可在设置中改用 API。');e.status=503;throw e;}return d;}
  async create(id,type,payload){await this.select(id,type==='codex'?'codex':'translation');return this.serial(async()=>{const job={id:randomUUID(),deviceId:id,type,status:'queued',createdAt:this.now(),expires:this.now()+(type==='translation'?86400000:360000),attempt:0};await atomicJSON(join(this.store.root,'job-'+job.id+'.json'),{payload});this.state.jobs[job.id]=job;return {...job};});}
  claim(deviceId){return this.serial(()=>{
    for(const j of Object.values(this.state.jobs))if(j.expires<this.now()&&!['done','failed'].includes(j.status)){j.status='failed';j.error='任务超时，请重试';}
    const j=Object.values(this.state.jobs).find(j=>j.deviceId===deviceId&&j.status==='queued');if(!j)return null;j.status='running';j.startedAt=this.now();j.attempt++;return {...j};
  });}
  async payload(id){return (await readJSON(join(this.store.root,'job-'+validId(id)+'.json'))).payload;}
  async job(id){await this.ready;const j=this.state.jobs[validId(id)];if(j&&j.expires<this.now()&&!['done','failed'].includes(j.status))await this.serial(()=>{j.status='failed';j.error='任务已过期，请重试；原文和旧译本均保留';});return structuredClone(j||null);}
  progress(deviceId,id,message){return this.serial(()=>{const j=this.state.jobs[id];if(!j||j.deviceId!==deviceId)throw Error('任务不存在');if(j.status==='running')j.message=String(message).slice(0,500);return {ok:true};});}
  finish(deviceId,id,result,error){return this.serial(async()=>{const j=this.state.jobs[id];if(!j||j.deviceId!==deviceId)throw Error('任务不存在');if(['done','failed'].includes(j.status))return {ok:true};if(j.status!=='running')throw Error('任务尚未开始');if(error){j.status='failed';j.error=String(error).slice(0,1000);}else{await atomicJSON(join(this.store.root,'result-'+j.id+'.json'),result);j.status='done';}j.finishedAt=this.now();return {ok:true};});}
  async result(id){const j=await this.job(id);if(j?.status!=='done')throw Error(j?.error||'任务未完成');return readJSON(join(this.store.root,'result-'+validId(id)+'.json'));}
  cancel(id){return this.serial(()=>{const j=this.state.jobs[id];if(!j)throw Error('任务不存在');if(j.status!=='done'){j.status='failed';j.error='已取消';}return {cancelled:true};});}
  async wait(id,signal){while(true){signal?.throwIfAborted();const j=await this.job(id);if(j?.status==='done')return this.result(id);if(!j||j.status==='failed')throw Error(j?.error||'任务不存在');if(this.now()-this.state.devices[j.deviceId].seen>45000){await this.cancel(id);throw Error('本机助手已离线');}if(j.expires<this.now()){await this.cancel(id);throw Error('本机助手响应超时');}await new Promise(r=>setTimeout(r,500));}}
}
