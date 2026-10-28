import {deviceHeaders} from './cloud-storage.js';
export function detectDocumentLanguage(text) {
 const letters=(text.match(/[A-Za-z]/g)||[]).length,han=(text.match(/[\u3400-\u9fff]/g)||[]).length;
 const words=(text.match(/\b[A-Za-z]{2,}\b/g)||[]).length;
 if(words>=20 && letters>han*3)return 'en';
 if(han>=30 && han*3>=letters)return 'zh';
 return 'unknown';
}
export async function translationRequest(path,body) {
 const r=await fetch('/api/translation/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...deviceHeaders()},body:JSON.stringify(body)});
 let data;try{data=await r.json();}catch{throw Error('完整翻译服务尚未启动，请重启本机工作台服务');}
 if(!r.ok)throw Error(data.error||'翻译服务请求失败');return data;
}
export async function waitForTranslation(id,{signal,onProgress=()=>{}}={}) {
 while(true){
  signal?.throwIfAborted();const job=await translationRequest('jobs/'+id);onProgress(job);
  if(job.status==='complete')return translationRequest('jobs/'+id+'/result');
  if(['failed','cancelled','interrupted'].includes(job.status))throw Error(job.message);
  await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(new DOMException('已取消','AbortError'));};
   const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},2000);
   signal?.addEventListener('abort',abort,{once:true});
  });
 }
}
