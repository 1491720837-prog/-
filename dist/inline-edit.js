// One textarea inside the existing card: text selection, IME and native undo stay native.
export function createInlineEditor({getNode,checkpoint,save,onResize,onEnd}) {
  let active=null;
  const finish=()=>{
    if(!active)return;
    const {id,key,host,input}=active;active=null;
    const node=getNode(id);
    host.textContent=node?.[key] || '';
    host.classList.toggle('empty',!node?.[key]);
    host.closest('.node')?.classList.remove('editing');
    input.remove();onResize();onEnd();
  };
  return {
    get active(){return !!active;},finish,
    start(card,key){
      finish();
      const id=card.dataset.nodeId,node=getNode(id);
      const host=card.querySelector(key==='title'?'.node-title':'.node-text');
      if(!node||!host)return;
      const input=document.createElement('textarea');
      input.className='node-inline-editor';input.value=node[key]||'';
      input.setAttribute('aria-label',key==='title'?'直接编辑节点标题':'直接编辑节点内容');
      input.setAttribute('placeholder',key==='title'?'节点标题':'写下你的想法…');
      input.rows=1;input.spellcheck=false;
      let checkpointed=false;
      active={id,key,host,input};
      card.classList.add('editing');host.classList.remove('empty');host.replaceChildren(input);
      const resize=()=>{input.style.height='0px';input.style.height=Math.max(key==='title'?20:48,input.scrollHeight)+'px';onResize();};
      input.addEventListener('input',()=>{
        const current=getNode(id);if(!current)return;
        if(current[key]!==input.value){
          if(!checkpointed){checkpoint();checkpointed=true;}
          current[key]=input.value;
          if(key==='title'){current.titleEdited=true;card.setAttribute('aria-label',input.value);}
          save();
        }
        resize();
      });
      input.addEventListener('blur',finish,{once:true});
      input.addEventListener('keydown',e=>{
        e.stopPropagation();
        if(e.isComposing)return;
        if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){e.preventDefault();finish();card.focus({preventScroll:true});}
      });
      for(const type of ['pointerdown','click','dblclick'])input.addEventListener(type,e=>e.stopPropagation());
      resize();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
    }
  };
}
