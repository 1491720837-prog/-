import {capturePage} from './capture.js';
const target=document.querySelector('#target'),status=document.querySelector('#status'),button=document.querySelector('#save');
const saved=await chrome.storage.local.get('folioURL');if(saved.folioURL)target.value=saved.folioURL;
button.onclick=async()=>{
  button.disabled=true;
  try{
    const url=new URL(target.value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('请填写工作台首页地址');
    if(url.protocol==='http:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('在线工作台必须使用 HTTPS');
    // Request only the chosen Folio origin, not access to all source websites.
    const granted=await chrome.permissions.request({origins:[url.origin+'/*']});if(!granted)throw Error('需要访问工作台的权限才能交付采集内容');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('没有可采集的页面');
    const [extracted]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:capturePage});
    const capture=extracted.result,id=crypto.randomUUID();await chrome.storage.local.set({folioURL:url.href,['capture:'+id]:capture});
    status.textContent='已采集，正在连接工作台…';
    const tabs=await chrome.tabs.query({url:url.origin+'/*'});let folio=tabs.find(t=>new URL(t.url).pathname==='/');
    if(!folio)folio=await chrome.tabs.create({url:url.href,active:false});
    let delivered=false;
    for(let i=0;i<30;i++){
      try{const [r]=await chrome.scripting.executeScript({target:{tabId:folio.id},func:async(capture,id)=>{
        if(!document.querySelector('#app')||!document.querySelector('#podcast-button'))return {ready:false};
        return await new Promise(resolve=>{const handler=event=>{if(event.source===window&&event.origin===location.origin&&event.data?.type==='folio-capture-received'&&event.data.id===id){clearTimeout(timer);window.removeEventListener('message',handler);resolve({ready:true});}};const timer=setTimeout(()=>{window.removeEventListener('message',handler);resolve({ready:false});},1000);window.addEventListener('message',handler);window.postMessage({type:'folio-capture',id,capture},location.origin);});
      },args:[capture,id]});if(r.result?.ready){delivered=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    if(!delivered)throw Error('请在工作台完成登录或刷新新版页面，再回原文点击采集。此次采集已暂存插件本机。');
    await chrome.storage.local.remove('capture:'+id);status.textContent='已送到工作台，请在工作台选择保存位置。';
    await chrome.tabs.update(folio.id,{active:true});
  }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
};
