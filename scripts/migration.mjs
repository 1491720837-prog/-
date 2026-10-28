import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {atomicJSON} from './cloud-store.mjs';
// Contains document mappings and preference history, never lark-cli credentials.
export async function exportSyncBundle(sync,comments){
  await sync.ready;await comments.ready;if(sync.running||sync.reading||sync.pending.size)throw Error('正在同步，请稍后导出');
  const projects={};for(const [id,p] of Object.entries(sync.state.projects)){
    if(!p.doc)continue;if(p.incoming||p.staging)throw Error('请先处理待合并或未完成的飞书同步');
    projects[id]={mapping:structuredClone(p),base:await sync.readbackBase(id)};
  }
  return {format:'folio-feishu-migration-v1',projects,comments:structuredClone(comments.state)};
}
export async function importSyncBundle(sync,comments,store,bundle){
  await sync.ready;await comments.ready;
  if(bundle?.format!=='folio-feishu-migration-v1')throw Error('飞书迁移格式无效');
  if(sync.state.enabled||sync.running||Object.keys(sync.state.projects).length)throw Error('仅可迁入尚未启用飞书的空在线配置，避免覆盖现有映射');
  for(const [id,p] of Object.entries(bundle.projects||{})){
    if(!await store.head(id))throw Error('请先导入对应阅读项目：'+id);
    if(p.base?.snapshot?.projectId!==id||!Array.isArray(p.base.items)||!p.mapping?.doc||p.mapping.staging||p.mapping.incoming)throw Error('飞书映射不完整');
  }
  for(const [id,p] of Object.entries(bundle.projects||{})){
    await mkdir(join(sync.root,id),{recursive:true});await atomicJSON(join(sync.root,id,'readback-base.json'),p.base);await atomicJSON(join(sync.root,id+'.json'),p.base.snapshot);
    sync.state.projects[id]=p.mapping;
  }
  if(bundle.comments){comments.state={...bundle.comments,enabled:false,owner:''};await comments.save();}
  sync.state.enabled=false;await sync.save();return {ok:true,projects:Object.keys(bundle.projects||{}).length,message:'映射已导入。请暂停本机飞书同步、完成云端授权后再启用在线同步。'};
}
