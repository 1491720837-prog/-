export function validateChat(chat){
  if(chat===undefined)return;
  if(!chat||typeof chat.id!=='string'||!/^[a-zA-Z0-9-]{1,128}$/.test(chat.id)||!Array.isArray(chat.messages)||chat.messages.length>1000)throw Error('画布聊天数据无效');
  const ids=new Set();let total=0;
  for(const m of chat.messages){if(!m||typeof m.id!=='string'||ids.has(m.id)||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>200000)throw Error('聊天消息无效');ids.add(m.id);total+=m.text.length;}
  if(total>8_000_000)throw Error('聊天记录过大，请导出备份后另建项目');
}
export function chatHistory(messages,budget=70000){
  const out=[];let size=0;for(const m of [...messages].reverse()){if(m.error||m.pending)continue;if(size+m.text.length>budget||out.length>=70)break;size+=m.text.length;out.unshift({role:m.role,content:m.text});}return out;
}
export function transcriptChunks(text,limit=24000){const result=[];while(text.length){let end=Math.min(limit,text.length);if(end<text.length){const line=text.lastIndexOf('\n',end);if(line>limit/2)end=line+1;}result.push(text.slice(0,end));text=text.slice(end);}return result;}
export function validateOutline(value,doc){
  if(!Array.isArray(value?.nodes)||!value.nodes.length||value.nodes.length>60)throw Error('模型未返回有效大纲（1–60 个节点）');
  const ids=new Set();return value.nodes.map(n=>{
    if(typeof n.id!=='string'||ids.has(n.id)||typeof n.title!=='string'||!n.title.trim()||n.title.length>500||typeof n.text!=='string'||n.text.length>10000||(n.parentId&&!ids.has(n.parentId)))throw Error('大纲层级或内容无效，未修改画布');
    ids.add(n.id);const quote=typeof n.quote==='string'&&doc.text.includes(n.quote)?n.quote:'';
    const timestamp=typeof n.timestamp==='string'&&/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?$/.test(n.timestamp)&&doc.text.includes(n.timestamp)?n.timestamp:'';
    return {id:n.id,parentId:n.parentId||null,title:n.title.trim(),text:n.text,quote,timestamp};
  });
}
export function selectedChatText(message,text){if(typeof text!=='string'||!text.trim()||!message.text.includes(text))return message.text;return text;}
