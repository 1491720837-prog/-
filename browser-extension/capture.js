// Self-contained: Chrome serializes this function into the active tab.
export function capturePage(){
  const selected=window.getSelection()?.toString().trim();
  const root=document.querySelector('#js_content')||document.querySelector('.note-detail-mask .note-scroller')||document.querySelector('article')||document.querySelector('main')||document.querySelector('[role="main"]')||document.body;
  const blocks=[],seen=new Set();let total=0;
  const skip=el=>el.closest('nav,header,footer,aside,script,style,noscript,form,[hidden],[aria-hidden="true"],.comments-container,#js_cmt_area');
  const visible=el=>!!el.getClientRects().length&&!['hidden','collapse'].includes(getComputedStyle(el).visibility);
  if(selected)blocks.push({type:'text',text:selected});
  else for(const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,img')){
    if(skip(el)||!visible(el))continue;
    if(el.tagName==='IMG'){
      const src=el.getAttribute('data-src')||el.currentSrc||el.src;
      if(!src||seen.has(src)||(el.naturalWidth&&el.naturalWidth<100))continue;
      try{const url=new URL(src,location.href);if(!['http:','https:'].includes(url.protocol))continue;blocks.push({type:'image',url:url.href,alt:el.alt||''});seen.add(src);}catch{}continue;
    }
    // Nested list/blockquote paragraphs should not duplicate their parent text.
    if(el.querySelector('p,li,blockquote,pre'))continue;
    const text=el.innerText?.trim();if(!text)continue;total+=text.length;if(total>1_000_000||blocks.length>=2000)throw Error('文章太长，请先选中需要的部分再采集');blocks.push({type:'text',text});
  }
  if(!blocks.some(b=>b.type==='text')){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),pieces=[];
    while(walker.nextNode()){const parent=walker.currentNode.parentElement;if(parent&&!skip(parent)&&visible(parent)){const value=walker.currentNode.textContent.trim();if(value)pieces.push(value);}}
    const text=pieces.join('\n');if(text.length>1_000_000)throw Error('页面太长，请先选中文章正文');if(text)blocks.unshift({type:'text',text});
  }
  const text=blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n\n');
  if(text.length<10)throw Error('没有找到正文，请展开文章或选中文字后重试');
  return {title:(document.querySelector('#activity-name')?.textContent||document.querySelector('meta[property="og:title"]')?.content||document.title).trim(),url:location.href,author:document.querySelector('meta[name="author"]')?.content||document.querySelector('#js_name')?.textContent?.trim()||'',text,blocks,selection:!!selected};
}
