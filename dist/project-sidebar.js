// Project navigation uses the same saved-project APIs as import and backup.
export function mountProjectSidebar({current,list,open,backup,create,importProject,esc,icon,onResize,onError}) {
  const panel=document.querySelector('#project-sidebar'),toggle=document.querySelector('#projects-button');
  const search=panel.querySelector('input'),entries=panel.querySelector('#project-directory');
  let projects=[],request=0,switching=false,isOpen=true;
  try { isOpen=localStorage.getItem('folio-project-sidebar')!=='closed'; } catch {}
  function render() {
    const state=current(),query=search.value.trim().toLocaleLowerCase();
    const active={id:state.projectId,title:state.title,nodes:state.nodes.length,docs:state.docs.length,documentNames:state.docs.map(d=>d.name)};
    const all=projects.some(p=>p.id===active.id)?projects.map(p=>p.id===active.id?active:p):[active,...projects];
    const matches=all.filter(p=>[p.title,...(p.documentNames||[])].join(' ').toLocaleLowerCase().includes(query));
    panel.querySelector('#project-total').textContent=all.length;
    const scroll=entries.scrollTop;
    entries.innerHTML=matches.length?matches.map(p=>`<div class="project-entry${p.id===state.projectId?' active':''}"><button class="project-open" data-open-project="${esc(p.id)}" aria-label="${p.id===state.projectId?'当前项目':'打开项目'}" aria-current="${p.id===state.projectId}" ${switching?'disabled':''}><span class="project-folder">${icon('book')}</span><span><strong>${esc(p.title||'未命名项目')}</strong><small>${p.docs} 份资料 · ${p.nodes} 个节点${p.id===state.projectId?' · 当前':''}</small></span></button><button class="icon-button project-backup" data-backup-project="${esc(p.id)}" title="下载完整备份" aria-label="下载完整备份">${icon('download')}</button></div>`).join(''):'<p class="project-directory-message">没有找到匹配的项目，试试项目名或资料名。</p>';
    entries.scrollTop=scroll;
  }
  async function refresh() {
    if(!isOpen)return;
    const version=++request;
    try { const result=await list();if(version!==request)return;projects=result;render();panel.querySelector('#project-directory-error').textContent=''; }
    catch(e){if(version===request)panel.querySelector('#project-directory-error').textContent='项目列表读取失败，请点击刷新重试。';}
  }
  function setOpen(value) {
    isOpen=value;panel.classList.toggle('hidden',!value);
    toggle.setAttribute('aria-expanded',String(value));toggle.title=value?'收起项目栏':'展开项目栏';
    try { localStorage.setItem('folio-project-sidebar',value?'open':'closed'); } catch {}
    if(value){render();void refresh();}else toggle.focus({preventScroll:true});
    onResize();
  }
  toggle.onclick=()=>setOpen(!isOpen);
  panel.querySelector('#projects-collapse').onclick=()=>setOpen(false);
  panel.querySelector('#projects-refresh').onclick=refresh;
  panel.querySelector('#new-project').onclick=create;
  panel.querySelector('#import-project').onclick=importProject;
  search.oninput=render;
  search.onkeydown=e=>{if(e.key==='Escape'&&search.value){e.stopPropagation();search.value='';render();}};
  entries.onclick=async e=>{
    const button=e.target.closest('[data-open-project],[data-backup-project]');if(!button||switching)return;
    const id=button.dataset.openProject||button.dataset.backupProject;
    if(button.hasAttribute('data-backup-project')) {try{await backup(id);}catch(error){onError(error.message);}return;}
    if(id===current().projectId)return;
    switching=true;render();
    try {await open(id);}catch(error){onError(error.message);}finally{switching=false;render();void refresh();}
  };
  window.addEventListener('focus',()=>void refresh());
  window.addEventListener('folio-project-saved',()=>void refresh());
  // Defer layout adjustment until app bootstrap has initialized its resize timer.
  queueMicrotask(()=>setOpen(isOpen));
  return {refresh,render};
}
