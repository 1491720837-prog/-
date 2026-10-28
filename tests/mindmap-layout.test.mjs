import test from 'node:test';
import assert from 'node:assert/strict';
import { mindmapLayout, nextNodePosition } from '../dist/mindmap-layout.js';
const size = n => ({width:n.width || 262, height:n.height || 160});
const graph = () => [
  {id:'a',x:40,y:0,width:520,height:450},
  {id:'b',parentId:'a',x:40,y:230,height:340},
  {id:'c',parentId:'a',x:40,y:500,height:120},
  {id:'d',parentId:'b',x:40,y:400,width:600,height:600},
  {id:'solo',x:650,y:800,height:500},
];
test('horizontal forest preserves content and hierarchy, separates variable-size subtrees and independent roots',()=>{
  const nodes=graph(), before=JSON.stringify(nodes), positions=mindmapLayout(nodes,size);
  assert.equal(JSON.stringify(nodes),before);
  for(const n of nodes) if(n.parentId) {
    const parent=nodes.find(p=>p.id===n.parentId);
    assert.ok(positions.get(n.id).x >= positions.get(parent.id).x + size(parent).width + 100);
  }
  const boxes=nodes.map(n=>({...positions.get(n.id),...size(n)}));
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];
    assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
  }
  assert.equal(positions.get('solo').x,positions.get('a').x);
  assert.ok(positions.get('solo').y > Math.max(...nodes.filter(n=>n.id!=='solo').map(n=>positions.get(n.id).y+size(n).height)));
  const laid=nodes.map(n=>({...n,...positions.get(n.id)}));
  assert.deepEqual(mindmapLayout(laid,size),positions);
});
test('new independent nodes append below all content, children go right without overlapping enlarged siblings',()=>{
  const nodes=graph(), p=mindmapLayout(nodes,size);
  for(const n of nodes)Object.assign(n,p.get(n.id));
  const standalone=nextNodePosition(nodes,null,size);
  assert.equal(standalone.x,nodes[0].x);
  assert.ok(nodes.every(n=>standalone.y>n.y+size(n).height));
  const child=nextNodePosition(nodes,'a',size,{width:400,height:480});
  assert.ok(child.x>nodes[0].x+size(nodes[0]).width);
  for(const n of nodes) assert.ok(child.x+400<=n.x || n.x+size(n).width<=child.x || child.y+480<=n.y || n.y+size(n).height<=child.y);
});
test('layout supports deep chains and empty workspaces',()=>{
  assert.equal(mindmapLayout([],size).size,0);
  assert.deepEqual(nextNodePosition([],null,size),{x:45,y:70});
  const nodes=Array.from({length:1000},(_,i)=>({id:String(i),parentId:i?String(i-1):null,x:0,y:i*200}));
  const result=mindmapLayout(nodes,size);
  assert.equal(result.size,1000);
  assert.ok(result.get('999').x>result.get('998').x);
});
