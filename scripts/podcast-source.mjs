import {publicText,publicURL} from './public-network.mjs';
const entities=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[m]||String.fromCodePoint(Math.min(0x10ffff,parseInt(m.slice(m[2]==='x'?3:2,-1),m[2]==='x'?16:10)||32))));
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),entities(m[2]??m[3])]));
const text=s=>entities(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function canonicalPodcastURL(value){const u=publicURL(value);if(/(^|\.)xiaoyuzhoufm\.com$/.test(u.hostname)&&/^\/episode\/[a-f\d]+\/?$/.test(u.pathname))u.search='';return u.href;}
export function parsePodcastPage(html,url){
  const sourceUrl=canonicalPodcastURL(url),u=new URL(sourceUrl),fallback=text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'播客逐字稿');
  if(/(^|\.)xiaoyuzhoufm\.com$/.test(u.hostname)){
    const raw=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>attrs(m[1]).id==='__NEXT_DATA__');
    let e;try{e=JSON.parse(raw?.[2]).props.pageProps.episode;}catch{throw Error('小宇宙页面没有可读取的单集信息，请使用公开单集链接');}
    if(e?.eid!==u.pathname.split('/').filter(Boolean).at(-1))throw Error('页面单集与链接不匹配');
    if(e.isPrivateMedia||e.media?.source?.mode!=='PUBLIC')throw Error('该单集未提供公开音频，不能自动获取');
    return [{title:e.title,sourceUrl,audioUrl:publicURL(e.media.source.url).href,duration:e.duration,show:e.podcast?.title||'',platform:'xiaoyuzhou'}];
  }
  const items=[...html.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if(items.length){return items.map(m=>{const a=attrs(m[1].match(/<enclosure\b([^>]*)/i)?.[1]||'');if(!a.url)return null;return {title:text(m[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||fallback),sourceUrl,audioUrl:publicURL(new URL(a.url,url).href).href,platform:'rss'};}).filter(Boolean).slice(0,200);}
  const urls=new Set();
  for(const m of html.matchAll(/<(?:audio|source|meta)\b([^>]*)>/gi)){const a=attrs(m[1]);let candidate;if(a.src&&(/<audio/i.test(m[0])||a.type?.startsWith('audio/')))candidate=a.src;if(['og:audio','og:audio:url','og:audio:secure_url'].includes(a.property))candidate=a.content;if(candidate)urls.add(new URL(candidate,url).href);}
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(attrs(m[1]).type==='application/ld+json'){
    try{const walk=x=>{if(!x||typeof x!=='object')return;if(['AudioObject','PodcastEpisode'].includes(x['@type'])){const a=x.contentUrl||x.associatedMedia?.contentUrl||x.audio?.contentUrl;if(a)urls.add(new URL(a,url).href);}for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);};walk(JSON.parse(m[2]));}catch{}
  }
  return [...urls].map((audioUrl,i)=>({title:fallback+(urls.size>1?` · 音频 ${i+1}`:''),sourceUrl,audioUrl:publicURL(audioUrl).href,platform:'web'}));
}
export async function resolvePodcast(value,{read=publicText}={}){
  const url=canonicalPodcastURL(value),u=new URL(url);
  if(/\.(mp3|m4a|aac|wav|ogg|amr)(?:$)/i.test(u.pathname))return [{title:decodeURIComponent(u.pathname.split('/').at(-1)).slice(0,400),sourceUrl:url,audioUrl:url,platform:'audio'}];
  const page=await read(url),found=parsePodcastPage(page.text,page.url||url);
  if(!found.length)throw Error('未找到公开音频。请使用小宇宙单集、公开 RSS 或音频直链；节目介绍不能代替逐字稿。');
  return found;
}
