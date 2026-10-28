// A shared three-way merge. Never use timestamps as conflict resolution.
export function mergeFeishuChanges(project, changes, choice, additions=[]) {
 const next=structuredClone(project),conflicts=[];let count=0;
 for(const change of changes){
  const node=next.nodes.find(n=>n.id===change.id);
  if(!node){conflicts.push({id:change.id,title:change.title,field:'node',local:'节点已在工作台删除',remote:'飞书节点仍存在'});continue;}
  for(const [field,delta] of Object.entries(change.fields)){
   if(!['title','text','prompt'].includes(field)||typeof delta.base!=='string'||typeof delta.value!=='string')throw Error('飞书变更格式无效');
   const local=node[field]||'';
   if(local===delta.value)continue;
   if(local!==delta.base){
    if(!choice){conflicts.push({id:node.id,title:node.title,field,local,remote:delta.value});continue;}
    if(choice==='local')continue;
    if(choice!=='remote')throw Error('冲突处理选项无效');
   }
   node[field]=delta.value;if(field==='title')node.titleEdited=true;count++;
  }
 }
 for(const addition of additions){
  if(next.nodes.some(n=>n.id===addition.id))continue;
  const parent=next.nodes.find(n=>n.id===addition.parentId);
  if(!parent){conflicts.push({id:addition.id,title:addition.title,field:'node',local:'父节点已删除',remote:'AI 新增子节点'});continue;}
  const {path,...node}=structuredClone(addition);
  next.nodes.push({...node,x:parent.x+(parent.width||262)+110,y:Math.max(parent.y,...next.nodes.map(n=>n.y+(n.height||220)+48)),width:360,collapsed:false});
  count++;
 }
 return {project:next,conflicts,count};
}
