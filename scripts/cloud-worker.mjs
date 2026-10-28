import {join} from 'node:path';
import {readJSON,atomicJSON} from './cloud-store.mjs';
import {mergeFeishuChanges} from '../dist/feishu-merge.js';
import {projectSnapshot} from '../dist/feishu-format.js';
import {pairedTranslation} from '../dist/model.js';

export class CloudWorker {
  constructor({store,sync,comments,ai,devices}){Object.assign(this,{store,sync,comments,ai,devices});this.running=false;this.errors={};this.lastRun=null;this.ready=store.ready.then(async()=>{this.settings=await readJSON(join(store.root,'settings.json'),{commentProvider:'api',apiFallback:true});});}
  async configure(settings){await this.ready;if(!['api','codex'].includes(settings.commentProvider))throw Error('后台模型方式无效');this.settings={commentProvider:settings.commentProvider,commentDevice:String(settings.commentDevice||''),codexModel:String(settings.codexModel||''),apiModel:String(settings.apiModel||''),apiFallback:settings.apiFallback===true};await atomicJSON(join(this.store.root,'settings.json'),this.settings);return this.settings;}
  async receive(id,choice){
    const incoming=await this.sync.pull(id);if(incoming.busy)return false;if(incoming.unchanged)return true;
    for(let attempt=0;attempt<3;attempt++){
      const record=await this.store.get(id);if(!record)return false;
      if(record.project.feishuReceipt!==incoming.token){
        const additions=(incoming.additions||[]).map(n=>({...n,source:record.project.nodes.find(p=>p.id===n.parentId)?.source||n.source}));
        const merged=mergeFeishuChanges(record.project,incoming.changes,choice,additions);
        if(merged.conflicts.length){this.errors[id]={message:'飞书和工作台同时修改了同一字段，请选择版本',conflicts:merged.conflicts};return false;}
        merged.project.feishuReceipt=incoming.token;
        try{await this.store.put(merged.project,record.revision,'feishu');}catch(e){if(e.status===409)continue;throw e;}
      }
      await this.sync.acknowledge(id,incoming.token);await this.comments.afterAck(id,{keptLocal:choice==='local'});delete this.errors[id];return true;
    }
    return false;
  }
  async integrateTranslations(){
    await this.devices.ready;
    for(const j of Object.values(this.devices.state.jobs).filter(j=>j.type==='translation'&&j.status==='done')){
      const marker=join(this.store.root,'translation-applied-'+j.id+'.json');if(await readJSON(marker,null))continue;
      const result=await this.devices.result(j.id),payload=await this.devices.payload(j.id),record=await this.store.get(result.projectId);
      if(!record)continue;const d=record.project.docs.find(d=>d.id===result.docId);
      if(!d||d.data!==payload.data){await atomicJSON(marker,{skipped:'原文已变化，译本保留在任务结果中'});continue;}
      if(d.translationPDF?.id==='translation-'+j.id){await atomicJSON(marker,{ok:true});continue;}
      if(d.translationPDF){await atomicJSON(marker,{skipped:'已有中文译本，未覆盖'});continue;}
      d.translationPDF=pairedTranslation(d,{...result,type:'pdf'},'translation-'+j.id);d.fullTranslation={id:j.id,status:'complete',report:result.report};
      try{await this.store.put(record.project,record.revision,'translation');await atomicJSON(marker,{ok:true});}catch(e){if(e.status!==409)throw e;}
    }
  }
  async tick(){
    if(this.running)return;this.running=true;
    try{
      await this.ready;await this.integrateTranslations();await this.sync.ready;await this.comments.ready;
      if(!this.sync.state.enabled)return;
      for(const p of await this.store.list()){
        try{
          if(!await this.receive(p.id))continue;
          const record=await this.store.get(p.id);await this.sync.enqueue(projectSnapshot(record.project));
          if(this.sync.running||this.sync.pending.size)continue;
          const job=await this.comments.next(p.id);if(!job)continue;
          try{const result=await this.ai.answerComment(job,record.project,this.settings);await this.comments.complete({id:job.id,...result});await this.receive(p.id);}
          catch(e){await this.comments.fail(job.id,e.message);throw e;}
          delete this.errors[p.id];
        }catch(e){this.errors[p.id]={message:e.message};}
      }
    }finally{this.running=false;this.lastRun=new Date().toISOString();}
  }
  start(){this.timer=setInterval(()=>this.tick().catch(e=>{this.errors.worker={message:e.message};}),15000);this.timer.unref();}
  stop(){clearInterval(this.timer);}
}
