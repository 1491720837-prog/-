import {deviceHeaders} from './cloud-storage.js';
let codexCache, codexPending, codexAt=0, apiCache, apiPending, apiAt=0;
async function codexCatalog() {
  if(codexCache && Date.now()-codexAt<30000) return codexCache;
  if(!codexPending) codexPending=fetch('/api/codex/status',{headers:deviceHeaders()}).then(async r=>{
    if(!r.ok)throw new Error('无法读取模型列表');
    codexCache=await r.json();codexAt=Date.now();return codexCache;
  }).finally(()=>{codexPending=null;});
  return codexPending;
}
// The gateway proxies the provider's /models endpoint so the key never reaches the
// browser. A missing list is normal (no API configured) and must not break Codex.
async function apiCatalog() {
  if(apiCache && Date.now()-apiAt<60000) return apiCache;
  if(!apiPending) apiPending=fetch('/api/models').then(async r=>{
    if(!r.ok)throw new Error('无法读取模型列表');
    apiCache=await r.json();apiAt=Date.now();return apiCache;
  }).finally(()=>{apiPending=null;});
  return apiPending;
}
export function mountModelPicker(root,{getConfig,onSelect,onSettings}) {
  const controller=new AbortController(),{signal}=controller;
  const button=root.querySelector('.model-picker-trigger'), menu=root.querySelector('.model-picker-menu');
  let data,api,open=false,filter='';
  const close=(focus=false)=>{open=false;menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
  const current=()=>{
    const c=getConfig();
    if(c.readingProvider==='api')return c.model ? `API · ${c.model}`:(api?.models?.length?'API · 服务端默认':'模型 API');
    return data?.models?.find(m=>c.codexModel?m.id===c.codexModel:m.isDefault)?.name || c.codexModel || '默认模型';
  };
  const label=()=>{button.querySelector('span').textContent=current();button.title=`选择模型 · 当前：${current()}`;};
  function render() {
    menu.replaceChildren();
    const heading=document.createElement('div');heading.className='model-menu-heading';heading.textContent='选择模型';menu.append(heading);
    const config=getConfig();
    const option=(name,id,provider,disabled=false)=>{
      const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitemradio');
      const active=(config.readingProvider||'codex')===provider&&(provider==='api'?config.model||'':(config.codexModel||''))===id;
      item.setAttribute('aria-checked',String(active));item.disabled=disabled;
      const text=document.createElement('span');text.textContent=name;
      const mark=document.createElement('span');mark.textContent=active?'✓':'';mark.setAttribute('aria-hidden','true');
      item.append(text,mark);
      item.addEventListener('click',()=>{onSelect(id,{provider});label();close();root.closest('form')?.querySelector('input')?.focus();},{signal});menu.append(item);
    };
    const group=name=>{const div=document.createElement('div');div.className='model-menu-heading';div.textContent=name;menu.append(div);};
    group('Codex · 本机登录');
    if(data?.authenticated && data.models?.length){
      option('默认 · 跟随账户','','codex');
      for(const m of data.models)option(m.name,m.id,'codex');
    } else {
      const message=document.createElement('div');message.className='model-menu-note';message.textContent=data?.error || 'Codex 未连接，请在服务设置中检查登录。';menu.append(message);
    }
    if(api?.configured && api.models?.length){
      const usable=api.models.filter(m=>m.tools);
      group(`API 模型 · ${usable.length} 个支持工具调用`);
      option('服务端默认（FOLIO_AI_MODEL）','','api');
      const container=document.createElement('div');container.className='model-menu-api';menu.append(container);
      const draw=()=>{
        container.replaceChildren();
        const shown=usable.filter(m=>!filter||m.id.toLowerCase().includes(filter)||m.name.toLowerCase().includes(filter)).slice(0,80);
        if(!shown.length){const none=document.createElement('div');none.className='model-menu-note';none.textContent='没有匹配的模型';container.append(none);return;}
        for(const m of shown){
          const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitemradio');
          const active=config.readingProvider==='api'&&(config.model||'')===m.id;
          item.setAttribute('aria-checked',String(active));
          const text=document.createElement('span');text.textContent=m.context?`${m.name} · ${Math.round(m.context/1000)}k`:m.name;
          const mark=document.createElement('span');mark.textContent=active?'✓':'';mark.setAttribute('aria-hidden','true');
          item.append(text,mark);
          item.addEventListener('click',()=>{onSelect(m.id,{provider:'api'});label();close();root.closest('form')?.querySelector('input')?.focus();},{signal});
          container.append(item);
        }
      };
      if(usable.length>12){
        const input=document.createElement('input');input.type='search';input.className='model-menu-search';input.placeholder='搜索模型…';input.setAttribute('aria-label','搜索 API 模型');
        input.addEventListener('input',()=>{filter=input.value.trim().toLowerCase();draw();},{signal});
        menu.append(input);
      }
      draw();
      const note=document.createElement('div');note.className='model-menu-note';note.textContent='只列出支持工具调用的模型，项目对话需要检索全文。要使用其他模型，请在服务设置中填写模型 ID。';menu.append(note);
    } else if(api && (api.configured===false || api.error)){
      group('API 模型');
      const message=document.createElement('div');message.className='model-menu-note';message.textContent=api.error || '尚未配置 API 服务商，请在服务设置中填写。';menu.append(message);
    }
    const settings=document.createElement('button');settings.type='button';settings.setAttribute('role','menuitem');settings.className='model-menu-settings';settings.textContent='服务设置…';
    settings.addEventListener('click',()=>{close();onSettings();},{signal});menu.append(settings);
  }
  async function load(show=false){
    try{data=await codexCatalog();}catch(e){data={error:e.message};}
    try{api=await apiCatalog();}catch(e){api={error:e.message};}
    if(signal.aborted)return;
    label();if(show&&open){render();(menu.querySelector('[aria-checked="true"]')||menu.querySelector('button'))?.focus();}
  }
  button.addEventListener('click',()=>{
    if(open){close();return;}
    open=true;filter='';menu.hidden=false;button.setAttribute('aria-expanded','true');
    menu.textContent='正在读取模型…';load(true);
  },{signal});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();},{signal});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true);return;}
    if(!open||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    if(e.target?.type==='search')return;
    e.preventDefault();e.stopPropagation();
    const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  },{signal});
  document.addEventListener('focusin',e=>{if(!root.contains(e.target))close();},{signal});
  label();load();
  return Object.assign(()=>{controller.abort();close();},{refresh:()=>{filter='';label();load(open);}});
}
