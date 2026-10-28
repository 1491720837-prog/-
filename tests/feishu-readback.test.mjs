import test from 'node:test';import assert from 'node:assert/strict';
import {mergeFeishuChanges} from '../dist/feishu-merge.js';
import {remoteChanges} from '../scripts/feishu-readback.mjs';
const text=content=>({elements:[{text_run:{content}}]});
const nodes=[{id:'n',title:'节点',text:'原始内容',prompt:''}];
const mapping={n:'title'};
const blocks=[{block_id:'doc',block_type:1,children:['title']},{block_id:'title',parent_id:'doc',block_type:13,ordered:text('节点'),children:['body','quote','img']},{block_id:'body',parent_id:'title',block_type:2,text:text('原始内容')},{block_id:'quote',parent_id:'title',block_type:34,children:['source','excerpt']},{block_id:'source',parent_id:'quote',block_type:2,text:text('出处：文献 第 4 页')},{block_id:'excerpt',parent_id:'quote',block_type:2,text:text('证据原文')},{block_id:'img',parent_id:'title',block_type:27,image:{token:'image'}}];
test('readback extracts edited title, body and new paragraphs without mixing source or image',()=>{
 const current=structuredClone(blocks);current[1].ordered=text('新标题');current[2].text=text('新解释');current[1].children.push('added');current.push({block_id:'added',parent_id:'title',block_type:2,text:text('新增段落')});
 const changes=remoteChanges(blocks,current,mapping,nodes);assert.equal(changes[0].fields.title.value,'新标题');assert.equal(changes[0].fields.text.value,'新解释\n\n新增段落');assert.doesNotMatch(changes[0].fields.text.value,/出处|证据/);
});
test('unchanged and cleared body; native comments do not become body edits',()=>{
 const current=structuredClone(blocks);current[2].text.elements[0].text_run.text_element_style={comment_ids:['c']};assert.deepEqual(remoteChanges(blocks,current,mapping,nodes),[]);
 current[1].children=current[1].children.filter(id=>id!=='body');current.splice(2,1);assert.equal(remoteChanges(blocks,current,mapping,nodes)[0].fields.text.value,'');
});
test('unmapped structure, removed sections, image and citation edits stop safely',()=>{
 for(const mutate of [b=>b.splice(1,1),b=>b.find(b=>b.image).image.token='different',b=>b.find(b=>b.block_id==='source').text=text('different'),b=>b.push({block_id:'outside',block_type:2,text:text('new section')})]){const current=structuredClone(blocks);mutate(current);assert.throws(()=>remoteChanges(blocks,current,mapping,nodes));}
});
test('merge preserves canvas metadata and local changes to different fields',()=>{
 const project={nodes:[{...nodes[0],title:'本地标题',x:12,y:13,image:'saved',source:{page:4}}],edges:[{from:'a',to:'b'}]};
 const changes=[{id:'n',fields:{text:{base:'原始内容',value:'飞书正文'}}}];const r=mergeFeishuChanges(project,changes);assert.equal(r.conflicts.length,0);assert.equal(r.project.nodes[0].title,'本地标题');assert.equal(r.project.nodes[0].text,'飞书正文');assert.equal(r.project.nodes[0].x,12);assert.deepEqual(r.project.edges,project.edges);assert.equal(project.nodes[0].text,'原始内容');
});
test('same-field conflict has explicit choices; repeated delivery is idempotent',()=>{
 const project={nodes:[{...nodes[0],text:'本地正文'}]},changes=[{id:'n',fields:{text:{base:'原始内容',value:'飞书正文'}}}];
 assert.equal(mergeFeishuChanges(project,changes).conflicts.length,1);
 assert.equal(mergeFeishuChanges(project,changes,'local').project.nodes[0].text,'本地正文');
 const r=mergeFeishuChanges(project,changes,'remote');assert.equal(r.project.nodes[0].text,'飞书正文');assert.equal(mergeFeishuChanges(r.project,changes).count,0);
 assert.equal(mergeFeishuChanges({nodes:[]},changes,'remote').conflicts[0].field,'node');
});
