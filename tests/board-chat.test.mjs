import test from 'node:test';import assert from 'node:assert/strict';
import {validateChat,chatHistory,transcriptChunks,validateOutline,selectedChatText,requireProjectSourceGateway} from '../dist/board-chat-model.js';
import {createDemo} from '../dist/demo.js';import {validateDetails,validateProject} from '../dist/model.js';
import {collectProjectLiterature} from '../dist/literature.js';
test('per-project chats survive backup and invalid records cannot corrupt a project',()=>{const p=createDemo();p.chat={id:'chat-1',messages:[{id:'m1',role:'user',text:'问题'},{id:'m2',role:'assistant',text:'回答',model:'test'}]};const restored=validateDetails(validateProject(JSON.parse(JSON.stringify(p))));assert.deepEqual(restored.chat,p.chat);assert.throws(()=>validateChat({id:'ok',messages:[{id:'x',role:'system',text:'untrusted'}]}));assert.throws(()=>validateChat({id:'ok',messages:[{id:'x',role:'user',text:'a'},{id:'x',role:'user',text:'b'}]}));});
test('chat history excludes cancelled answers, bounds requests, and selected text cannot substitute arbitrary content',()=>{const m=[{role:'user',text:'abc'},{role:'assistant',text:'def'},{role:'assistant',text:'bad',error:'cancelled'}];assert.equal(chatHistory(m,4).length,1);assert.equal(chatHistory(m).length,2);assert.equal(selectedChatText(m[0],'bc'),'bc');assert.equal(selectedChatText(m[0],'not present'),'abc');});
test('transcript segmentation reads every character; outline hierarchy and citations are validated before mutation',()=>{const text='00:01\n原文证据。\n'.repeat(10000);assert.equal(transcriptChunks(text).join(''),text);assert.ok(transcriptChunks(text).every(t=>t.length<=24000));const nodes=[{id:'one',title:'主线',text:'概括'},{id:'two',parentId:'one',title:'证据',text:'说明',quote:'原文证据。',timestamp:'00:01'}];assert.equal(validateOutline({nodes},{text})[1].quote,'原文证据。');assert.equal(validateOutline({nodes:[{...nodes[0],quote:'编造',timestamp:'99:99'}]},{text})[0].quote,'');assert.throws(()=>validateOutline({nodes:[{...nodes[0],parentId:'two'},nodes[1]]},{text}));});
test('project chat always includes every original, including transcript tail and unselected article',async()=>{
 const p=createDemo(),transcript='00:01 正文。\n'.repeat(12000)+'02:00:00 最后的原始证据';
 p.docs=[{id:'pod',name:'完整播客',type:'text',contentKind:'podcast',text:transcript,pages:1},{id:'article',name:'好文',type:'text',contentKind:'article',text:'未选中文章中的独有证据',pages:1}];p.activeDoc='pod';
 for(const nodes of [[],[{source:{docId:'article',page:1}}]]){
  const result=await collectProjectLiterature(p,nodes,{docIds:[]});
  assert.equal(result.pages.filter(x=>x.docId==='pod').map(x=>x.text).join(''),transcript);
  assert(result.pages.some(x=>x.docId==='article'&&x.text.includes('独有证据')));assert.equal(result.documents.length,2);
 }
 await assert.rejects(()=>collectProjectLiterature({...p,docs:[{...p.docs[0],text:''}]},[]),/无法读取项目原始资料/);
});
test('project chat requires the full-source gateway for API requests',()=>{
 assert.doesNotThrow(()=>requireProjectSourceGateway({readingProvider:'codex'},'https://folio.example'));
 assert.doesNotThrow(()=>requireProjectSourceGateway({readingProvider:'api',endpoint:'/api/chat'},'https://folio.example'));
 for(const endpoint of ['https://external.example/v1/chat/completions','/other'])assert.throws(()=>requireProjectSourceGateway({readingProvider:'api',endpoint},'https://folio.example'),/全文检索/);
});
