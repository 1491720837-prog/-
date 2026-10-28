import {mkdir, readFile, writeFile, rename, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {validateProject, validateDetails} from '../dist/model.js';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function validId(id) {
  if(typeof id !== 'string' || ['constructor','prototype','__proto__'].includes(id) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id)) throw Error('无效的项目或任务编号');
  return id;
}
export async function atomicJSON(path,value) {
  const tmp=path+'.'+randomUUID()+'.tmp';
  await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,path);
}
export async function readJSON(path,fallback) {
  try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}
}
export class Conflict extends Error {constructor(){super('云端已有更新，未覆盖任何版本。请先下载本机草稿，再重新载入云端版本。');this.status=409;}}

// A single-process store on a persistent volume. Blobs and revisions are immutable;
// HEAD is the only commit point. Do not run multiple replicas against this volume.
export class CloudStore {
  constructor(root){this.root=root;this.chain=Promise.resolve();this.ready=mkdir(join(root,'projects'),{recursive:true,mode:0o700}).then(()=>mkdir(join(root,'blobs'),{recursive:true,mode:0o700}));}
  serial(fn){const next=this.chain.catch(()=>{}).then(fn);this.chain=next;return next;}
  dir(id){return join(this.root,'projects',validId(id));}
  async head(id){await this.ready;return readJSON(join(this.dir(id),'head.json'),null);}
  async list(){await this.ready;const result=[];for(const id of await readdir(join(this.root,'projects'))){const h=await this.head(id);if(h)result.push(h);}return result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  async pack(project){
    const copy=structuredClone(project);delete copy.config;delete copy._cloudRevision; // Credentials/endpoints remain device or server configuration.
    const blob=async(value)=>{const key=digest(value),path=join(this.root,'blobs',key);try{await writeFile(path,value,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}return {$folioBlob:key};};
    for(const d of copy.docs){if(d.data)d.data=await blob(d.data);if(d.translationPDF?.data)d.translationPDF.data=await blob(d.translationPDF.data);}
    for(const n of copy.nodes)if(n.image)n.image=await blob(n.image);
    return copy;
  }
  async unpack(project){
    const value=async v=>{if(!v?.$folioBlob)return v;if(!/^[a-f0-9]{64}$/.test(v.$folioBlob))throw Error('损坏的文件引用');return readFile(join(this.root,'blobs',v.$folioBlob),'utf8');};
    for(const d of project.docs){d.data=await value(d.data);if(d.translationPDF)d.translationPDF.data=await value(d.translationPDF.data);}
    for(const n of project.nodes)if(n.image)n.image=await value(n.image);
    return project;
  }
  async get(id,revision){const head=await this.head(id);if(!head)return null;const rev=revision||head.revision;if(!/^[a-f0-9-]{36}$/.test(rev))throw Error('无效的版本');const record=await readJSON(join(this.dir(id),rev+'.json'));return {...record,project:await this.unpack(record.project)};}
  async put(project,expected=null,reason='browser') {return this.serial(async()=>{
    await this.ready;validId(project.projectId);validateDetails(validateProject(project));
    const head=await this.head(project.projectId);if((head?.revision||null)!==expected)throw new Conflict();
    const packed=await this.pack(project),hash=digest(JSON.stringify(packed));if(head?.hash===hash)return head;
    const dir=this.dir(project.projectId);await mkdir(dir,{recursive:true,mode:0o700});
    const revision=randomUUID(),updatedAt=new Date().toISOString();
    await atomicJSON(join(dir,revision+'.json'),{revision,previous:expected,updatedAt,reason,project:packed});
    const next={id:project.projectId,revision,hash,updatedAt,title:project.title,docs:project.docs.length,nodes:project.nodes.length,documentNames:project.docs.map(d=>d.name)};
    await atomicJSON(join(dir,'head.json'),next);return next;
  });}
  async history(id){const head=await this.head(id);if(!head)return [];const rows=[];let rev=head.revision;while(rev&&rows.length<100){const r=await readJSON(join(this.dir(id),rev+'.json'));rows.push({revision:r.revision,updatedAt:r.updatedAt,reason:r.reason});rev=r.previous;}return rows;}
}
