// Keep native textarea selection/IME/undo; measure in an out-of-flow copy, never collapse the live editor.
export function createInlineEditor({getNode,checkpoint,save,onResize,onEnd,renderText}) {
  let active=null;
  const finish=()=>{
    if(!active)return;
    const {id,key,host,input,toolbar}=active;active=null;
    const body=host.closest('.node-body'),scroll=body?.scrollTop||0,node=getNode(id);
    if(key==='text'&&renderText)host.innerHTML=renderText(node?.[key]||'');else host.textContent=node?.[key]||'';
    host.classList.toggle('empty',!node?.[key]);host.closest('.node')?.classList.remove('editing');
    input.remove();toolbar?.remove();onResize();if(body)body.scrollTop=scroll;onEnd();
  };
  return {
    get active(){return !!active;},finish,
    start(card,key){
      finish();
      const id=card.dataset.nodeId,node=getNode(id),host=card.querySelector(key==='title'?'.node-title':'.node-text');
      if(!node||!host)return;
      const body=card.querySelector('.node-body'),scroll=body.scrollTop;
      const input=document.createElement('textarea');input.className='node-inline-editor';input.value=node[key]||'';
      input.setAttribute('aria-label',key==='title'?'直接编辑节点标题':'直接编辑节点内容');input.placeholder=key==='title'?'节点标题':'支持 Markdown，或用上方格式按钮';input.rows=1;input.spellcheck=false;
      let checkpointed=false,toolbar;
      card.classList.add('editing');host.classList.remove('empty');host.replaceChildren(input);
      const resize=()=>{
        const top=body.scrollTop,left=body.scrollLeft;
        const measure=input.cloneNode();measure.value=input.value;measure.removeAttribute('aria-label');measure.setAttribute('aria-hidden','true');measure.tabIndex=-1;
        Object.assign(measure.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',height:'0px',minHeight:'0px',width:input.offsetWidth+'px',top:'0',left:'0'});
        host.append(measure);const height=measure.scrollHeight;measure.remove();
        input.style.height=Math.max(key==='title'?20:48,height)+'px';onResize();body.scrollTop=top;body.scrollLeft=left;
      };
      if(key==='text'){
        toolbar=document.createElement('div');toolbar.className='node-format-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','节点文本格式');
        const format=kind=>{
          const top=body.scrollTop,start=input.selectionStart,end=input.selectionEnd;
          let a=start,b=end,replacement;
          if(kind==='bold'){replacement='**'+(input.value.slice(a,b)||'加粗文字')+'**';}
          else {
            a=input.value.lastIndexOf('\n',start-1)+1;b=input.value.indexOf('\n',end);if(b<0)b=input.value.length;
            const prefix=({h1:'# ',h2:'## ',h3:'### ',bullet:'- ',ordered:'1. ',quote:'> '})[kind];
            replacement=input.value.slice(a,b).split('\n').map(line=>prefix+line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/,'')).join('\n');
          }
          input.setRangeText(replacement,a,b,'select');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});body.scrollTop=top;
        };
        for(const [kind,label] of [['bold','加粗'],['h1','H1'],['h2','H2'],['h3','H3'],['ordered','有序列表'],['bullet','无序列表'],['quote','引用']]){
          const button=document.createElement('button');button.type='button';button.className='small-button';button.textContent=label;button.setAttribute('aria-label',label==='H1'||label==='H2'||label==='H3'?label+' 标题':label);
          button.onpointerdown=e=>e.preventDefault();button.onclick=e=>{e.stopPropagation();format(kind);};toolbar.append(button);
        }
        host.before(toolbar);
      }
      active={id,key,host,input,toolbar};
      input.addEventListener('input',()=>{
        const current=getNode(id);if(!current)return;
        if(current[key]!==input.value){if(!checkpointed){checkpoint();checkpointed=true;}current[key]=input.value;
          if(key==='title'){current.titleEdited=true;card.setAttribute('aria-label',input.value);}save();}
        resize();
      });
      input.addEventListener('blur',e=>{if(toolbar?.contains(e.relatedTarget))return;finish();});
      toolbar?.addEventListener('focusout',e=>{if(e.relatedTarget!==input&&!toolbar.contains(e.relatedTarget))finish();});
      input.addEventListener('keydown',e=>{
        e.stopPropagation();if(e.isComposing)return;
        if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='b'&&toolbar){e.preventDefault();toolbar.querySelector('button').click();return;}
        if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){e.preventDefault();finish();card.focus({preventScroll:true});}
      });
      for(const type of ['pointerdown','click','dblclick'])input.addEventListener(type,e=>e.stopPropagation());
      resize();input.focus({preventScroll:true});body.scrollTop=scroll;
    }
  };
}
