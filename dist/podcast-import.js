import {safeWebURL} from './content-source.js';
async function request(path,body){const r=await fetch('/api/podcasts/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw Error('请重启工作台服务以启用播客导入');}if(!r.ok)throw Error(data.error||'播客请求失败');return data;}
export function openPodcastImport({modal,esc,projectId,uid,onImport,download,toast}){
  const dialog=modal('导入播客 / 飞书逐字稿',`<p>粘贴公开播客单集链接，自动获取音频并通过飞书妙记转写。也支持已有妙记链接。音频会上传到你已登录的飞书账号，转写受该账号额度限制。</p><label class="field-label" for="podcast-url">公开单集 / RSS / 音频直链 / 飞书妙记</label><input id="podcast-url" class="text-field" type="url" placeholder="https://www.xiaoyuzhoufm.com/episode/…"><label style="display:block;margin:12px 0"><input id="podcast-new-project" type="checkbox" checked> 建立独立项目，保留当前文献和导图</label><div id="podcast-message" role="status"></div><div id="podcast-episodes"></div><h3>转写任务</h3><div id="podcast-jobs">正在读取…</div>`,'<button class="button primary" id="podcast-start">获取音频并转写</button>');
  dialog.dataset.podcast='true';const get=id=>dialog.querySelector('#'+id);let alive=true,automatic=null,importing=false;
  const close=()=>{alive=false;clearTimeout(timer);delete dialog.dataset.podcast;dialog.removeEventListener('close',close);};dialog.addEventListener('close',close);
  const add=async id=>{if(importing)return;importing=true;try{await onImport(await request('jobs/'+id+'/result'));}catch(e){toast(e.message);}finally{importing=false;}};
  const start=async(episodeIndex)=>{const url=get('podcast-url').value.trim(),target=get('podcast-new-project').checked?uid():projectId();get('podcast-start').disabled=true;try{const j=await request('jobs',{url,projectId:target,...(episodeIndex===undefined?{}:{episodeIndex})});automatic=j.id;get('podcast-message').textContent='任务已保存。关闭窗口不会取消转写；完成后保留在任务列表。';await refresh();}catch(e){get('podcast-message').textContent=e.message;}finally{if(get('podcast-start'))get('podcast-start').disabled=false;}};
  get('podcast-start').onclick=async()=>{
    const url=get('podcast-url').value.trim();if(!safeWebURL(url)){get('podcast-message').textContent='请输入完整链接';return;}
    if(/\/minutes\//.test(new URL(url).pathname))return start();
    get('podcast-start').disabled=true;get('podcast-message').textContent='正在识别节目…';
    try{const {episodes}=await request('resolve',{url});if(episodes.length===1)await start(0);else{get('podcast-episodes').innerHTML='<p>这个链接包含多集，请选择本次要转写的一集：</p>'+episodes.map((e,i)=>`<p><button class="button" data-episode="${i}">${esc(e.title)}</button></p>`).join('');get('podcast-episodes').querySelectorAll('[data-episode]').forEach(b=>b.onclick=()=>start(Number(b.dataset.episode)));}}catch(e){get('podcast-message').textContent=e.message;}finally{if(get('podcast-start'))get('podcast-start').disabled=false;}
  };
  let timer;async function refresh(){
    if(!alive||!dialog.open||!get('podcast-jobs'))return;
    try{const jobs=await request('jobs');if(!alive||!get('podcast-jobs'))return;
      get('podcast-jobs').innerHTML=jobs.length?jobs.map(j=>`<div class="project-entry"><strong>${esc(j.title)}</strong><p>${esc(j.message||j.status)}</p>${safeWebURL(j.minuteUrl)?`<a href="${esc(j.minuteUrl)}" target="_blank" rel="noopener">打开飞书妙记</a>`:''}<div>${j.status==='complete'?`<button class="button" data-import-podcast="${j.id}">打开逐字稿项目</button><button class="button" data-download-podcast="${j.id}">下载 TXT</button>`:['failed','cancelled'].includes(j.status)?`<button class="button" data-retry-podcast="${j.id}">重试</button>`:!['review','uploading','creating'].includes(j.status)?`<button class="button" data-cancel-podcast="${j.id}">停止</button>`:''}</div></div>`).join(''):'<p>还没有任务。</p>';
      get('podcast-jobs').querySelectorAll('[data-import-podcast]').forEach(b=>b.onclick=()=>add(b.dataset.importPodcast));
      get('podcast-jobs').querySelectorAll('[data-download-podcast]').forEach(b=>b.onclick=async()=>{try{const r=await request('jobs/'+b.dataset.downloadPodcast+'/result');download(r.document.name+'.txt',r.transcript,'text/plain;charset=utf-8');}catch(e){toast(e.message);}});
      for(const action of ['retry','cancel'])get('podcast-jobs').querySelectorAll(`[data-${action}-podcast]`).forEach(b=>b.onclick=async()=>{try{await request('jobs/'+b.dataset[action+'Podcast']+'/'+action,{});await refresh();}catch(e){toast(e.message);}});
      if(automatic&&jobs.some(j=>j.id===automatic&&j.status==='complete')){const id=automatic;automatic=null;await add(id);}
    }catch(e){if(get('podcast-jobs'))get('podcast-jobs').textContent=e.message;}
    clearTimeout(timer);if(alive)timer=setTimeout(refresh,3000);
  }
  refresh();return dialog;
}
