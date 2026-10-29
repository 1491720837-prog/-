import test from 'node:test';import assert from 'node:assert/strict';
import {renderMarkdown} from '../dist/node-markdown.js';
import {renderProject,projectSnapshot,prose} from '../dist/feishu-format.js';
import {nativeOutline} from '../scripts/feishu-outline.mjs';
import {projectRemoteFields} from '../scripts/feishu-readback.mjs';
test('shared markdown escapes HTML and preserves headings, bold, grouped/nested lists and quotes',()=>{
 const text='## 小标题\n1. **第一项**\n2. 第二项\n  - 子项\n\n> 引用\n> 第二行\n<script>alert(1)</script>';
 const html=renderMarkdown(text);assert.equal(html,prose(text));assert.match(html,/<h2>小标题/);assert.equal((html.match(/<ol>/g)||[]).length,1);assert.match(html,/<li seq="auto">第二项<ul><li>子项/);assert.match(html,/<b>第一项/);assert.match(html,/<blockquote><p>引用/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'),/href=/);
});
test('marked node titles do not confuse body headings with node hierarchy, including matching names',()=>{
 const text=s=>({elements:[{text_run:{content:s}}]});
 const items=[{block_id:'a',block_type:3,heading1:text('[FOLIO_NODE:root] Root')},{block_id:'h',block_type:4,heading2:text('Child')},{block_id:'li',block_type:13,ordered:text('list item')},{block_id:'b',block_type:4,heading2:text('[FOLIO_NODE:child] Child')},{block_id:'last',block_type:3,heading1:text('Body heading after last node')}];
 const nodes=[{id:'root',title:'Root'},{id:'child',parentId:'root',title:'Child'}];
 const plan=nativeOutline(items,items.map(b=>b.block_id),nodes,{marked:true});assert.deepEqual(plan.nodeTitles,{root:'a',child:'b'});assert.equal(plan.owners.h,'root');assert.equal(plan.owners.last,'child');assert.equal(plan.descendants.find(b=>b.block_id==='h').block_type,4);assert.equal(plan.descendants[0].ordered.elements[0].text_run.content,'Root');
 const readback=projectRemoteFields(plan.descendants,plan.nodeTitles);assert.match(readback.fields.root.text,/## Child/);assert.match(readback.fields.root.text,/1\. list item/);assert.match(readback.fields.child.text,/# Body heading/);
 const xml=renderProject(projectSnapshot({projectId:'p',title:'P',docs:[],nodes:[{id:'root',title:'Root',text:'## Child'}],edges:[]}),{},{nodeMarkers:true});assert.match(xml,/\[FOLIO_NODE:root\] Root/);assert.match(xml,/<h2>Child/);
});
