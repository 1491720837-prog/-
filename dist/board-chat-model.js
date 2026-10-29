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

export const projectReadingSystem = '本项目的原始资料是每轮对话的必备上下文，与画布节点范围无关。回答涉及文献、播客或文章的事实时，优先依据原始 PDF 文字、完整逐字稿或文章正文；已附片段不足时必须用 search_document 和 read_document_page 查阅全文，不要只根据节点标题、摘要或历史回答推测。PDF 引用实际页码；逐字稿引用已有时间戳或说话人，文章引用段落，不把文本分块编号当页码。无法读取的页面和图片必须明确说明，不得声称看过；本轮资料目录为准，不要把其他项目或已移除的资料视为当前证据。';
export function requireProjectSourceGateway(config, origin) {
  if (config.readingProvider !== 'api') return;
  const url = new URL(config.endpoint || '/api/chat', origin);
  if (url.origin !== new URL(origin).origin || url.pathname !== '/api/chat')
    throw Error('项目对话需要全文检索。请在服务设置中把接口设为 /api/chat，并在工作台服务端配置 API 服务商；直接连接外部接口无法提供完整资料阅读工具。');
}
