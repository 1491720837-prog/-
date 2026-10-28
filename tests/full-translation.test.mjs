import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TranslationJobs,validateTranslations,validateReview} from '../scripts/translation-jobs.mjs';
import {detectDocumentLanguage} from '../dist/full-translation.js';

test('language detection uses document text, keeps Chinese and inconclusive scans distinct',()=>{
 assert.equal(detectDocumentLanguage('The study examines how people work with artificial intelligence and make decisions through experiences and comparisons in a changing design process.'),'en');
 assert.equal(detectDocumentLanguage('本文研究人工智能与人的设计判断。参与者在研究中比较不同的方向、解释与证据，并重新考虑之后应当如何行动。'),'zh');
 assert.equal(detectDocumentLanguage('Figure 1'),'unknown');
});
test('missing, duplicate or numerically corrupted translations are rejected',()=>{
 const blocks=[{id:'body',text:'A study of 31 people'},{id:'figure',text:'G2 shows 44 cases'}];
 assert.throws(()=>validateTranslations(blocks,{translations:[{id:'body',text:'31 人'}]}),/数量/);
 assert.throws(()=>validateTranslations(blocks,{translations:[{id:'body',text:'31 人'},{id:'body',text:'31 人'}]}),/重复/);
 assert.throws(()=>validateTranslations(blocks,{translations:[{id:'body',text:'31 人'},{id:'figure',text:'G2 共 40 例'}]}),/44/);
 assert.deepEqual(validateTranslations(blocks,{translations:[{id:'figure',text:'G2 展示 44 例'},{id:'body',text:'31 人的研究'}]}),{body:'31 人的研究',figure:'G2 展示 44 例'});
});
test('review must explicitly approve every figure without outstanding issues',()=>{
 assert.throws(()=>validateReview({pass:true,issues:['小字漏译']},{page:7}),/第 8 页/);
 assert.throws(()=>validateReview({pass:false,issues:[]},{page:7}),/未通过/);
 validateReview({pass:true,issues:[]},{page:7});
});
test('failed or interrupted jobs never expose a completed PDF; target identity survives restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'folio-translation-test-'));const jobs=new TranslationJobs({root});
 const id='12345678-1234-1234-1234-123456789012';
 try{await mkdir(jobs.dir(id));await jobs.save({id,status:'running',projectId:'old-project',docId:'paper'});
  assert.equal((await jobs.status(id)).status,'interrupted');
  await assert.rejects(jobs.result(id),/尚未通过/);
  await jobs.save({id,status:'complete',projectId:'old-project',docId:'paper',name:'Example',pages:2,report:{figures:3}});
  await writeFile(join(jobs.dir(id),'translated.pdf'),'%PDF-fixture');const result=await jobs.result(id);
  assert.equal(result.projectId,'old-project');assert.equal(result.docId,'paper');assert.equal(result.report.figures,3);
  assert.throws(()=>jobs.dir('../private'),/编号/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('concurrent startup cannot create a second translation job',async()=>{
 const jobs=new TranslationJobs();let release;
 const first=jobs.reserve(()=>new Promise(resolve=>{release=resolve;}));
 await assert.rejects(jobs.reserve(()=>Promise.resolve('second')),/已有完整翻译/);
 release('first');assert.equal(await first,'first');
 assert.equal(await jobs.reserve(()=>Promise.resolve('next')),'next');
 await assert.rejects(jobs.reserve(()=>Promise.reject(Error('setup failed'))),/setup failed/);
 assert.equal(await jobs.reserve(()=>Promise.resolve('recovered')),'recovered');
});
