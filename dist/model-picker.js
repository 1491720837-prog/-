import {deviceHeaders} from './cloud-storage.js';
let cached, pending, fetchedAt=0;
async function catalog() {
  if(cached && Date.now()-fetchedAt<30000)return cached;
  if(!pending)pending=fetch('/api/codex/status',{headers:deviceHeaders()}).then(async r=>{
    if(!r.ok)throw new Error('无法读取模型列表');
    const data=await r.json();cached=data;fetchedAt=Date.now();return data;
  }).finally(()=>pending=null);
  return pending;
}
export function mountModelPicker(root,{getConfig,onSelect,onSettings}) {
  const controller=new AbortController(),{signal}=controller;
  const button=root.querySelector('.model-picker-trigger'), menu=root.querySelector('.model-picker-menu');
  let data,open=false;
  const close=(focus=false)=>{open=false;menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
  const current=()=>{
    const c=getConfig();
    if(c.readingProvider==='api')return c.model ? `API · ${c.model}`:'模型 API';
    return data?.models?.find(m=>c.codexModel?m.id===c.codexModel:m.isDefault)?.name || c.codexModel || '默认模型';
  };
  const label=()=>{button.querySelector('span').textContent=current();button.title=`选择模型 · 当前：${current()}`;};
  function render() {
    menu.replaceChildren();
    const heading=document.createElement('div');heading.className='model-menu-heading';heading.textContent='选择模型';menu.append(heading);
    const config=getConfig();
    const option=(name,id,disabled=false)=>{
      const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitemradio');
      const checked=config.readingProvider!=='api'&&(config.codexModel||'')===id;
      item.setAttribute('aria-checked',String(checked));item.disabled=disabled;
      const text=document.createElement('span');text.textContent=name;
      const mark=document.createElement('span');mark.textContent=checked?'✓':'';mark.setAttribute('aria-hidden','true');
      item.append(text,mark);
      item.addEventListener('click',()=>{onSelect(id);label();close();root.closest('form')?.querySelector('input')?.focus();},{signal});menu.append(item);
    };
    if(data?.authenticated && data.models?.length){
      option('默认 · 跟随账户','');
      for(const m of data.models)option(m.name,m.id);
    } else {
      const message=document.createElement('div');message.className='model-menu-note';message.textContent=data?.error || 'Codex 未连接，请在服务设置中检查登录。';menu.append(message);
    }
    const note=document.createElement('div');note.className='model-menu-note';note.textContent='中等推理 · 选择后用于后续提问';menu.append(note);
    const settings=document.createElement('button');settings.type='button';settings.setAttribute('role','menuitem');settings.className='model-menu-settings';settings.textContent='服务设置…';
    settings.addEventListener('click',()=>{close();onSettings();},{signal});menu.append(settings);
  }
  async function load(show=false){
    try{data=await catalog();}catch(e){data={error:e.message};}
    if(signal.aborted)return;
    label();if(show&&open){render();(menu.querySelector('[aria-checked="true"]')||menu.querySelector('button'))?.focus();}
  }
  button.addEventListener('click',()=>{
    if(open){close();return;}
    open=true;menu.hidden=false;button.setAttribute('aria-expanded','true');
    menu.textContent='正在读取模型…';load(true);
  },{signal});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();},{signal});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true);return;}
    if(!open||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  },{signal});
  document.addEventListener('focusin',e=>{if(!root.contains(e.target))close();},{signal});
  label();load();
  return Object.assign(()=>{controller.abort();close();},{refresh:()=>{label();load(open);}});
}
