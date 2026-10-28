export const isCloud=typeof document!=='undefined'&&document.querySelector('meta[name="folio-mode"]')?.content==='cloud';
export const deviceHeaders=()=>isCloud?{'X-Folio-Device':localStorage.getItem('folio-device')||''}:{};
export async function cloudRequest(path,data,method='POST'){
  const r=await fetch(path,data===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await r.json();if(!r.ok){const e=Error(result.error||'云端请求失败');e.status=r.status;throw e;}return result;
}
export function portableProject(project){const p=structuredClone(project);delete p.config;delete p._cloudRevision;return p;}
const semantic=p=>{const x=portableProject(p);for(const key of ['view','page','reader'])delete x[key];for(const d of x.docs)delete d.fullTranslation;return JSON.stringify(x);};
const bases=new Map();let chain=Promise.resolve();
async function cache(project){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('folio-cloud-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const t=db.transaction('projects',project?'readwrite':'readonly'),s=t.objectStore('projects');if(project)s.put(project,project.projectId);const r=project?null:s.getAll();t.oncomplete=()=>resolve(r?.result);t.onabort=t.onerror=()=>reject(t.error);});}finally{db.close();}
}
export const cloudDrafts=()=>cache();
export const preserveCloudDraft=project=>cache(structuredClone(project));
function config(){try{return JSON.parse(localStorage.getItem('folio-cloud-config'))||{readingProvider:'api',endpoint:'/api/chat'};}catch{return {readingProvider:'api',endpoint:'/api/chat'};}}
export async function cloudRead(id){
  const record=await cloudRequest('/api/cloud/projects/'+encodeURIComponent(id));
  const p={...record.project,_cloudRevision:record.revision,config:config()};bases.set(record.revision,semantic(p));return p;
}
export async function cloudCurrent(){
  const projects=await cloudList(),id=localStorage.getItem('folio-active-project');
  const active=projects.find(p=>p.id===id)||projects[0];return active?cloudRead(active.id):undefined;
}
export const cloudList=()=>cloudRequest('/api/cloud/projects');
export function cloudWrite(project){
  const next=chain.catch(()=>{}).then(async()=>{
    const snapshot=structuredClone(project);localStorage.setItem('folio-cloud-config',JSON.stringify(project.config||{}));
    await cache(snapshot); // A failed upload leaves a recoverable draft in this browser.
    const p=portableProject(snapshot),head=await cloudRequest('/api/cloud/projects/'+encodeURIComponent(project.projectId),{project:p,revision:snapshot._cloudRevision||null},'PUT');
    project._cloudRevision=head.revision;bases.set(head.revision,semantic(snapshot));
    if(!localStorage.getItem('folio-active-project'))localStorage.setItem('folio-active-project',project.projectId);
    window.dispatchEvent(new CustomEvent('folio-project-saved',{detail:project}));return head;
  });chain=next;return next;
}
export async function cloudActivate(previous,next){await cloudWrite(previous);if(!next._cloudRevision)await cloudWrite(next);localStorage.setItem('folio-active-project',next.projectId);}
export async function cloudRefresh(current){
  if(!current._cloudRevision||bases.get(current._cloudRevision)!==semantic(current))return null;
  const before=semantic(current),revision=current._cloudRevision,head=(await cloudList()).find(p=>p.id===current.projectId);
  if(!head||head.revision===revision)return null;const next=await cloudRead(current.projectId);
  if(semantic(current)!==before||current._cloudRevision!==revision)return null;
  next.view=current.view;next.reader=current.reader;next.page=current.page;next.config=current.config;return next;
}
