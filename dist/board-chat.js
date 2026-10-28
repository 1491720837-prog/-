import {askAI,askCodex,readingSystem,parseJSON} from './ai.js';
import {collectLiterature} from './literature.js';
import {contextText,uid} from './model.js';
import {chatHistory,transcriptChunks,validateOutline,selectedChatText} from './board-chat-model.js';
import {mountModelPicker} from './model-picker.js';
export function mountBoardChat({root,getState,getSelected,persist,onNode,onOutline,toast,onSettings,onResize,preferences=async()=>''}){
  const q=s=>root.querySelector(s);let controller,owner,picker,selection='',selectedMessage='',renderedProject='',outlinePhase='',drafts=new Map();
  root.innerHTML=`<div class="panel-header"><strong>AI 对话</strong><button class="small-button" id="board-chat-close" aria-label="收起 AI 对话">收起</button></div><div class="chat-context"><strong id="board-chat-project"></strong><label><input type="checkbox" id="chat-docs" checked> 项目全部资料</label><select id="chat-scope" aria-label="画布上下文范围"><option value="all">整个画布</option><option value="selected">仅选中节点</option><option value="none">不附带节点</option></select><small id="chat-context-description"></small><small>内容作为阅读材料发送；切换范围不会抹去此前对话。</small></div><div id="board-messages" class="board-messages" aria-label="本项目聊天记录"></div><div id="chat-status" role="status"></div><div id="chat-selection-actions" hidden><button class="button" id="chat-selection-node" draggable="true">将选中文字拖到画布 / 点击成节点</button></div><div class="chat-composer"><button class="button subtle" id="podcast-outline">整理播客内容 → 节点大纲</button><form id="board-chat-form"><textarea id="board-chat-input" rows="3" placeholder="围绕这个画布，继续思考…" aria-label="向画布 AI 提问"></textarea><div class="chat-composer-actions"><div class="model-picker"><button type="button" class="model-picker-trigger" aria-haspopup="menu" aria-expanded="false"><span>选择模型</span>⌄</button><div class="model-picker-menu" role="menu" hidden></div></div><button type="button" class="button" id="chat-stop" hidden>停止</button><button class="button primary" id="chat-send">发送</button></div></form><small>选中回答文字可拖入画布；整条消息也可拖动「拖入画布」。</small></div>`;
  const ensure=(create=false)=>{const state=getState();if(create&&!state.chat)state.chat={id:uid(),messages:[]};return state.chat||{messages:[]};};
  function showProgress(text){if(getState()===owner)q('#chat-status').textContent=text;}
  function render(){
    const state=getState(),chat=ensure();if(renderedProject!==state.projectId){renderedProject=state.projectId;q('#board-chat-input').value=drafts.get(state.projectId)||'';selection='';selectedMessage='';q('#chat-selection-actions').hidden=true;}
    q('#board-chat-project').textContent=state.title;q('#chat-context-description').textContent=`${state.docs.length} 份资料 · ${state.nodes.length} 个节点 · ${chat.messages.length} 条消息`;
    q('#podcast-outline').hidden=!state.docs.some(d=>d.contentKind==='podcast');q('#podcast-outline').disabled=!!controller;
    const list=q('#board-messages'),nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;list.replaceChildren();
    if(!chat.messages.length){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='这个画布的专属对话。可以询问文献、比较观点，或先整理播客，再把有价值的内容留在画布。';list.append(empty);}
    for(const m of chat.messages){
      const card=document.createElement('article');card.className='chat-message '+m.role;card.dataset.messageId=m.id;
      const header=document.createElement('div');header.className='chat-message-meta';header.textContent=m.role==='user'?'你':`AI · ${m.model||'回答'}${m.reasoningEffort?' · '+m.reasoningEffort+' 推理':''}`;
      const body=document.createElement('div');body.className='chat-message-text';body.textContent=m.text;card.append(header,body);
      if(m.error||(m.pending&&!controller)){const error=document.createElement('p');error.className='chat-error';error.textContent=m.error||'上次生成已中断，请重新提问';card.append(error);}
      if(m.text&&!m.pending){const button=document.createElement('button');button.className='small-button';button.textContent='拖入画布';button.draggable=true;button.onclick=()=>onNode(m,m.text);button.ondragstart=e=>drag(e,m,m.text);card.append(button);}
      if(m.threadId){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Codex 会话';details.append(summary,document.createTextNode(m.threadId));card.append(details);}
      list.append(card);
    }
    if(nearBottom)list.scrollTop=list.scrollHeight;
    q('#chat-send').disabled=!!controller;q('#chat-stop').hidden=!controller;q('#chat-status').textContent=controller?(getState()===owner?'正在生成…':'另一个项目的回答正在生成，可回到该项目查看'):'本项目聊天独立保存；旧对话过长时会仅附带最近记录。';picker?.refresh();
  }
  function drag(e,m,text){e.dataTransfer.setData('application/x-folio-chat',JSON.stringify({projectId:getState().projectId,messageId:m.id,text}));e.dataTransfer.setData('text/plain',text);e.dataTransfer.effectAllowed='copy';}
  const selected=()=>ensure().messages.find(m=>m.id===selectedMessage);
  q('#board-messages').onmouseup=()=>{const s=getSelection();const el=s?.anchorNode?.parentElement?.closest('[data-message-id]');if(!s?.toString().trim()||!el||!q('#board-messages').contains(el))return;const end=s.focusNode?.parentElement?.closest('[data-message-id]');if(end!==el)return;selectedMessage=el.dataset.messageId;selection=s.toString();q('#chat-selection-actions').hidden=false;};
  q('#board-messages').ondragstart=e=>{const m=ensure().messages.find(m=>m.id===e.target.closest('[data-message-id]')?.dataset.messageId);if(m&&!e.target.closest('button'))drag(e,m,selectedChatText(m,getSelection()?.toString()));};
  q('#chat-selection-node').onclick=()=>{const m=selected();if(m)onNode(m,selectedChatText(m,selection));};q('#chat-selection-node').ondragstart=e=>{const m=selected();if(m)drag(e,m,selectedChatText(m,selection));};
  q('#board-chat-input').oninput=()=>drafts.set(getState().projectId,q('#board-chat-input').value);
  q('#board-chat-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();q('#board-chat-form').requestSubmit();}};
  const request=async(messages,config,literature,conversation)=>config.readingProvider==='api'?{content:await askAI(messages,config,controller.signal,{literature}),model:config.model||'API 服务默认',provider:'api'}:askCodex(messages,config,controller.signal,{literature,conversation,onEvent:e=>{if(e.type==='status')showProgress((outlinePhase?outlinePhase+' · ':'')+e.message);}});
  async function send(prompt,outline=false){
    if(controller||!prompt.trim())return;if(prompt.length>20000)return toast('问题过长，请分段提问');
    owner=getState();const workspace=owner,chat=ensure(true),config={...workspace.config},scope=q('#chat-scope').value,docIds=q('#chat-docs').checked?workspace.docs.map(d=>d.id):[],nodes=scope==='all'?workspace.nodes:scope==='selected'?workspace.nodes.filter(n=>getSelected().has(n.id)):[];
    for(const m of chat.messages)if(m.pending){delete m.pending;m.error='上次生成已中断，请重新提问';}
    if(chat.messages.length>995)return toast('聊天记录已满，请导出备份后另建项目');
    const user={id:uid(),role:'user',text:prompt,at:new Date().toISOString()},reply={id:uid(),role:'assistant',text:'',pending:true,at:new Date().toISOString()};chat.messages.push(user,reply);controller=new AbortController();q('#board-chat-input').value='';drafts.delete(workspace.projectId);render();
    try{
      await persist(workspace);const savedNodes=structuredClone(nodes),savedDocs=structuredClone(workspace.docs);
      if(outline){
        const doc=workspace.docs.find(d=>d.id===workspace.activeDoc&&d.contentKind==='podcast')||workspace.docs.find(d=>d.contentKind==='podcast');if(!doc)throw Error('请先导入播客逐字稿');
        const chunks=transcriptChunks(doc.text),notes=[];
        for(let i=0;i<chunks.length;i++){outlinePhase=`正在整理逐字稿 ${i+1} / ${chunks.length} 段`;showProgress(outlinePhase+'…');const part=await request([{role:'system',content:readingSystem+'完整阅读本次逐字稿片段，提取主要论点、论据、分歧与具体案例。保留已有时间戳和简短原文证据，区分发言与推断。不要把片段当作整期节目。输出精炼、至多 2500 字的整理。'},{role:'user',content:chunks[i]}],config);notes.push(part.content);}
        outlinePhase='正在生成层级节点';showProgress(outlinePhase+'…');const result=await request([{role:'system',content:readingSystem+'依据各片段整理生成完整播客的思维导图。只返回 JSON {"nodes":[{"id":"n1","parentId":null,"title":"主题","text":"完整说明","quote":"简短逐字原文（没有就空）","timestamp":"原有时间戳（没有就空）"}]}。1–60 个节点，父节点必须出现在子节点之前，id 唯一，层级不限。覆盖主题、观点、案例、分歧和可追问问题，避免重复。'},{role:'user',content:doc.name+'\n\n'+notes.join('\n\n')}],config);
        const plan=validateOutline(parseJSON(result.content),doc);if(getState()!==workspace)throw Error('项目已切换，未写入节点，请回原项目重试');
        Object.assign(reply,{text:plan.map(n=>(n.parentId?'  • ':'• ')+n.title+'\n'+n.text).join('\n\n'),model:result.model,reasoningEffort:result.reasoningEffort,source:{docId:doc.id,page:1,side:'en',text:''}});
        onOutline(plan,doc,reply.id);reply.outlineCreated=true;
      }else{
        const literature=await collectLiterature({...workspace,docs:savedDocs},savedNodes,{docIds,signal:controller.signal,onProgress:showProgress});
        const context=contextText(workspace,savedNodes,{sources:true,history:true,translation:true});if(context.length>100000)throw Error('画布文字过多，请选择“仅选中节点”缩小范围');
        const messages=[{role:'system',content:readingSystem+await preferences(workspace.projectId)},{role:'user',content:'当前项目与画布材料：\n'+context+literature.context},...chatHistory(chat.messages.filter(m=>m!==reply))];
        const images=savedNodes.filter(n=>n.image).slice(0,8);if(images.length)messages.push({role:'user',content:[{type:'text',text:'当前节点图片（最多 8 张）'},...images.map(n=>({type:'image_url',image_url:{url:n.image}}))]});
        const result=await request(messages,config,literature,{projectId:workspace.projectId,id:chat.id,title:workspace.title});
        Object.assign(reply,{text:result.content,model:result.model,reasoningEffort:result.reasoningEffort,threadId:result.threadId,evidence:{provider:result.provider||'api',model:result.model||'API 服务默认',reasoningEffort:result.reasoningEffort,sources:result.sources||[],attached:literature.attached,warnings:literature.warnings,trace:(result.trace||[]).slice(0,40)},prompt:prompt});
        if(savedNodes.length===1&&savedNodes[0].source)reply.source=structuredClone(savedNodes[0].source);
      }
    }catch(e){reply.error=e.message;toast(e.message);}finally{delete reply.pending;controller=null;outlinePhase='';try{await persist(workspace);}catch(e){toast('聊天保存失败：'+e.message);}render();}
  }
  q('#board-chat-form').onsubmit=e=>{e.preventDefault();send(q('#board-chat-input').value);};q('#podcast-outline').onclick=()=>send('整理播客内容，生成可继续阅读和扩展的节点大纲。',true);q('#chat-stop').onclick=()=>controller?.abort();
  q('#board-chat-close').onclick=()=>toggle(false);
  picker=mountModelPicker(q('.model-picker'),{getConfig:()=>getState().config,onSelect:id=>{getState().config.codexModel=id;getState().config.readingProvider='codex';persist(getState()).catch(e=>toast(e.message));},onSettings});
  function toggle(show=root.classList.contains('hidden')){root.classList.toggle('hidden',!show);document.querySelector('#chat-toggle')?.setAttribute('aria-pressed',String(show));onResize();if(show){render();q('#board-chat-input').focus();}}
  render();return {render,toggle,get busy(){return !!controller;},drop(data,position){if(data.projectId!==getState().projectId)throw Error('不能把其他项目的聊天直接写入当前画布');const m=ensure().messages.find(m=>m.id===data.messageId);if(!m||m.pending||!m.text)throw Error('消息不存在或仍在生成');onNode(m,selectedChatText(m,data.text),position);}};
}
