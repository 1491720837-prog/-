import test from 'node:test';import assert from 'node:assert/strict';
import {validateCorpus,searchPages,readPage,manifest} from '../scripts/literature-context.mjs';
const pages=[{docId:'paper',name:'Paper',side:'en',page:1,text:'We investigate outcome traction.'},{docId:'paper',name:'中文译本',side:'zh',page:1,text:'研究结果牵引力与用户判断之间的关系。'},{docId:'paper',name:'Paper',side:'en',page:6,text:'The marker is ORCHID-27. There are 18 participants.'},{docId:'other',name:'Other',side:'en',page:2,text:'The marker is DIFFERENT.'}];
test('retrieval finds evidence beyond nearby pages and isolates document/language scope',()=>{
 assert.equal(searchPages(pages,{query:'marker',docId:'paper'})[0].page,6);
 const zh=searchPages(pages,{query:'结果牵引力是什么',docId:'paper',side:'zh'});assert.equal(zh[0].side,'zh');assert.match(zh[0].snippet,/结果牵引力/);
 assert.equal(searchPages(pages,{query:'nonexistent'}).length,0);
 assert.throws(()=>readPage(pages,{docId:'unrelated',side:'en',page:6}),/没有/);
 assert.equal(readPage(pages,{docId:'paper',side:'en',page:6}).text,pages[2].text);
});
test('page reads paginate without dropping remaining text or falsifying page labels',()=>{
 const corpus=[{...pages[0],text:'a'.repeat(20000)}];const first=readPage(corpus,{docId:'paper',side:'en',page:1});
 const second=readPage(corpus,{docId:'paper',side:'en',page:1,offset:first.nextOffset});
 assert.equal(first.text+second.text,corpus[0].text);assert.equal(second.nextOffset,null);assert.match(first.label,/第 1 页/);
 assert.throws(()=>readPage(corpus,{docId:'paper',side:'en',page:1,offset:-1}),/偏移/);
});
test('validates corpus boundaries, duplicate page anchors and empty scanned pages',()=>{
 assert.deepEqual(validateCorpus(pages),pages);assert.throws(()=>validateCorpus([...pages,pages[0]]),/重复/);
 assert.throws(()=>validateCorpus([{...pages[0],page:0}]),/无效/);assert.throws(()=>validateCorpus([{...pages[0],text:[]}]),/无效/);
 assert.deepEqual(manifest([{...pages[0],text:''}])[0].emptyPages,[1]);
});
