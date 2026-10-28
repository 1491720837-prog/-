import {listSavedProjects,readSavedProject,validateProject,validateDetails} from './model.js';
import {cloudRequest,cloudDrafts,portableProject} from './cloud-storage.js';
const $=s=>document.querySelector(s),message=s=>$('#message').textContent=s;
function download(name,data){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
async function action(button,fn){button.disabled=true;try{await fn();}catch(e){message(e.message);}finally{button.disabled=false;}}
const status=await cloudRequest('/api/status'),cloud=status.cloud===true;
$('#mode').textContent=cloud?'在线版：项目保存在服务器；本机草稿作为额外保护。':'本机版：项目保存在当前浏览器。可在这里导出完整备份，迁入在线版。';
$('#export').onclick=e=>action(e.target,async()=>{const projects=[];for(const p of await listSavedProjects())projects.push(portableProject(await readSavedProject(p.id)));const feishu=await cloudRequest('/api/migration/feishu');download('Folio-全部项目-'+new Date().toISOString().slice(0,10)+'.json',{format:'folio-library-v1',projects,feishu});message(`已导出 ${projects.length} 个项目；请妥善保存包含文献和笔记的备份。`);});
if(cloud){
  $('#cloud-controls').hidden=false;$('#online-import').hidden=false;
  let s;async function refresh(){
    s=await cloudRequest('/api/cloud/status');for(const id of ['#device','#comment-device']){$(id).replaceChildren();option($(id),'','请选择设备');for(const d of s.devices.filter(d=>!d.revoked))option($(id),d.id,d.name+(d.online?' · 在线':' · 离线'));}
    $('#device').value=localStorage.getItem('folio-device')||'';$('#comment-device').value=s.settings.commentDevice||'';$('#provider').value=s.settings.commentProvider;$('#fallback').checked=s.settings.apiFallback;
    $('#api-model').replaceChildren();option($('#api-model'),'','服务默认');for(const m of s.apiModels)option($('#api-model'),m,m);$('#api-model').value=s.settings.apiModel||'';
    models();$('#devices').replaceChildren();for(const d of s.devices.filter(d=>!d.revoked)){const line=document.createElement('div');line.className='device';line.append(document.createTextNode(`${d.name} · ${d.online?'在线':'离线'} · ${d.capabilities.translation?'可完整翻译':'翻译未就绪'} `));const b=document.createElement('button');b.textContent='断开';b.onclick=()=>action(b,async()=>{await cloudRequest('/api/cloud/revoke',{id:d.id});await refresh();});line.append(b);$('#devices').append(line);}
    $('#worker').textContent=`API：${s.apiConfigured?'已配置':'未配置，离线时无法回答'}\n后台最近检查：${s.worker.lastRun||'等待首次检查'}\n`+Object.values(s.worker.errors).map(e=>e.message).join('\n');
    $('#history-project').replaceChildren();for(const p of await listSavedProjects())option($('#history-project'),p.id,p.title);
  }
  function models(){$('#codex-model').replaceChildren();option($('#codex-model'),'','设备默认');const d=s.devices.find(d=>d.id===$('#comment-device').value);for(const m of d?.capabilities.models||[])option($('#codex-model'),m.id,m.name);$('#codex-model').value=s.settings.codexModel||'';}
  $('#comment-device').onchange=models;
  $('#device').onchange=()=>{localStorage.setItem('folio-device',$('#device').value);message('已选择此浏览器的本机助手；回工作台后可选 Codex 模型。');};
  $('#pair').onclick=e=>action(e.target,async()=>{const p=await cloudRequest('/api/cloud/pair',{});$('#pair-code').hidden=false;$('#pair-code').textContent=p.code+'\n五分钟内有效，只在你自己的 Mac 上输入。';});
  $('#settings').onclick=e=>action(e.target,async()=>{await cloudRequest('/api/cloud/settings',{commentProvider:$('#provider').value,commentDevice:$('#comment-device').value,codexModel:$('#codex-model').value,apiModel:$('#api-model').value,apiFallback:$('#fallback').checked});message('后台设置已保存。');await refresh();});
  $('#drafts').onclick=e=>action(e.target,async()=>{download('Folio-浏览器草稿.json',{format:'folio-library-v1',projects:(await cloudDrafts()).map(portableProject)});message('草稿已下载；其中可能包含尚未上传成功的修改。');});
  $('#import').onclick=e=>action(e.target,async()=>{
    const file=$('#import-file').files[0];if(!file)throw Error('请选择整库备份');if(file.size>1_000_000_000)throw Error('备份超过 1 GB，请拆分项目导入');
    const bundle=JSON.parse(await file.text());if(bundle.format!=='folio-library-v1'||!Array.isArray(bundle.projects))throw Error('请选择「下载全部项目备份」生成的文件');
    for(const p of bundle.projects)validateDetails(validateProject(p));
    const existing=new Set((await listSavedProjects()).map(p=>p.id)),results=[];
    for(const p of bundle.projects){if(existing.has(p.projectId)){results.push(p.title+'：已存在，未覆盖');continue;}await cloudRequest('/api/cloud/projects/'+encodeURIComponent(p.projectId),{project:portableProject(p),revision:null},'PUT');results.push(p.title+'：已导入');}
    if(bundle.feishu){try{const r=await cloudRequest('/api/migration/feishu',bundle.feishu);results.push(r.message);}catch(e){results.push('飞书映射未导入：'+e.message);}}
    message(results.join('\n'));await refresh();
  });
  $('#history').onclick=e=>action(e.target,async()=>{const id=$('#history-project').value;if(!id)return;const versions=await cloudRequest('/api/cloud/projects/'+id+'/history');$('#versions').replaceChildren();for(const v of versions){const b=document.createElement('button');b.textContent=new Date(v.updatedAt).toLocaleString()+' · '+v.reason;b.onclick=()=>action(b,async()=>{const r=await cloudRequest('/api/cloud/projects/'+id+'?revision='+v.revision);download(r.project.title+'-旧版本.folio.json',r.project);});$('#versions').append(b);}});
  $('#logout').onclick=async()=>{await cloudRequest('/api/logout',{});location.href='/login.html';};
  await refresh();
}
