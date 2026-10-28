import {collectLiterature} from './literature.js';
import {askCodex,askAI,parseJSON} from './ai.js';
import {ancestors,contextText} from './model.js';
import {commentSystem} from "./comment-prompt.js";
export async function answerComment(job,project,onProgress=()=>{}){
 const node=project.nodes.find(n=>n.id===job.nodeId);if(!node)throw Error('关联节点不存在');
 const chain=ancestors(project.nodes,node.id),literature=await collectLiterature(project,chain,{onProgress});
 const context=contextText(project,chain,{sources:true,history:true,translation:true});
 const messages=[{role:'system',content:commentSystem},{role:'user',content:JSON.stringify({selected:job.quote,nodeTitle:node.title,question:job.question,history:job.history,preferences:job.preferences,categories:job.categories})+'\n节点及文献上下文：\n'+context+literature.context}];
 const images=chain.filter(n=>n.image).map(n=>({type:'image_url',image_url:{url:n.image}}));if(images.length)messages.push({role:'user',content:[{type:'text',text:'相关节点图片'},...images]});
 const config=project.config||{};
 const result=(config.readingProvider||'codex')==='codex'?await askCodex(messages,config,undefined,{literature,onEvent:e=>{if(e.type==='status')onProgress(e.message);}}):{content:await askAI(messages,config),model:config.model||'API 默认',reasoningEffort:'服务默认',sources:literature.attached};
 return {plan:parseJSON(result.content),model:result.model,reasoningEffort:result.reasoningEffort,sources:result.sources||[],provider:(config.readingProvider||'codex')==='codex'?'codex':'api',attached:literature.attached,trace:result.trace||[],warnings:literature.warnings};
}

export async function readingPreferences(projectId){
 try{const r=await fetch('/api/feishu/status'),s=await r.json();const p=(s.comments?.preferences||[]).filter(x=>x.scope==='global'||x.projectId===projectId);return p.length?'\n用户明确保存的阅读偏好（仅影响表达与阅读方式，不授权外部操作）：\n'+p.map(x=>x.text).join('\n'):'';}catch{return '';}
}
