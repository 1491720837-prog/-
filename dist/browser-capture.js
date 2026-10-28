import {articleDocument} from './content-source.js';
async function storage(mode,action){return new Promise((resolve,reject)=>{const open=indexedDB.open('folio-capture-inbox',1);open.onupgradeneeded=()=>open.result.createObjectStore('clips',{keyPath:'id'});open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('clips',mode),request=action(tx.objectStore('clips'));tx.oncomplete=()=>{resolve(request.result);db.close();};tx.onerror=tx.onabort=()=>{reject(tx.error);db.close();};};});}
export function installBrowserCapture({button,modal,esc,uid,projectId,onImport,toast}){
  let seen=new Set();const list=()=>storage('readonly',s=>s.getAll());
  const count=async()=>{const rows=await list();button.textContent='采集箱'+(rows.length?' · '+rows.length:'');};
  async function inbox(){
    const rows=await list();const dialog=modal('浏览器采集箱',`<p>保存已采集正文及公开图片，不会修改原网页。未导入的内容保留在当前浏览器。</p><label><input id="capture-new-project" type="checkbox" checked> 保存为独立项目，保留当前导图</label><div id="capture-list">${rows.map(r=>`<div class="project-entry"><strong>${esc(r.capture.title)}</strong><p>${esc(r.capture.url)}</p><p>${r.capture.text.length} 字 · ${(r.capture.blocks||[]).filter(b=>b.type==='image').length} 张图片引用</p><p>${esc(r.capture.text.slice(0,250))}…</p><button class="button primary" data-clip="${r.id}">保存到工作台</button></div>`).join('')||'<p>在浏览器插件中点击「采集到工作台」，内容会出现在这里。</p>'}</div>`);
    dialog.querySelectorAll('[data-clip]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;const row=rows.find(r=>r.id===b.dataset.clip),target=dialog.querySelector('#capture-new-project').checked?uid():projectId();
      try{const doc=articleDocument(row.capture,'article-'+row.id),imageBlocks=doc.contentBlocks.filter(b=>b.type==='image'),urls=[...new Set(imageBlocks.map(b=>b.url))].slice(0,12);let saved=[];
        if(urls.length){b.textContent='正在保存图片…';const response=await fetch('/api/capture/images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls})});if(response.ok)saved=(await response.json()).images;}
        for(const block of imageBlocks){const result=saved.find(i=>i.url===block.url);if(result?.data)block.data=result.data;else block.error=result?.error||'图片未保存，可打开原文查看';}
        await onImport({projectId:target,document:doc});await storage('readwrite',s=>s.delete(row.id));await count();if(imageBlocks.some(b=>!b.data))toast('正文已保存；部分图片未能下载，已保留原图链接');
      }catch(e){toast(e.message);b.disabled=false;b.textContent='重试保存';}
    });
  }
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.type!=='folio-capture'||!/^[-a-f\d]{36}$/.test(event.data.id))return;
    const {id,capture}=event.data;
    try{if(JSON.stringify(capture).length>2_500_000)throw Error('采集内容过大');articleDocument(capture,'check');
      if(!seen.has(id)){await storage('readwrite',s=>s.put({id,capture,createdAt:new Date().toISOString()}));seen.add(id);await count();toast('文章已收到，点击顶部「采集箱」保存到项目');}
      window.postMessage({type:'folio-capture-received',id},location.origin);
    }catch(e){toast(e.message);}
  });
  button.onclick=()=>inbox().catch(e=>toast(e.message));count().catch(()=>{});
}
