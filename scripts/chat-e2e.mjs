// Isolated synthetic project regression. All model, podcast and Feishu requests are mocked.
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {podcastDocument} from '../dist/content-source.js';
import {validateProject,validateDetails} from '../dist/model.js';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname,file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/'))throw Error();res.setHeader('Content-Type',['.js','.mjs'].includes(extname(file))?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));let target,outlineCalls=0;
 const transcript='说话人一 00:01\n个人上下文需要长期积累。\n\n说话人二 00:20\n任务上下文关注当下的目标。';
 const doc=podcastDocument({id:'pod',title:'测试播客',text:transcript,sourceUrl:'https://example.com/episode',minuteUrl:'https://example.feishu.cn/minutes/obctest',jobId:'test-job'});
 await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let data={enabled:false,connected:false,available:false};
   if(path==='/api/codex/chat'){
     const body=req.postDataJSON();requests.push(body);let content='这是依据材料的解释。长期上下文围绕个人。';
     if(!body.conversation){outlineCalls++;content=body.messages[0].content.includes('只返回 JSON')?JSON.stringify({nodes:[{id:'root',parentId:null,title:'个人 Agent',text:'上下文的组织方式。',quote:'个人上下文需要长期积累。',timestamp:'00:01'},{id:'child',parentId:'root',title:'当前任务',text:'任务上下文关注当下的目标。',quote:'任务上下文关注当下的目标。',timestamp:'00:20'}]}):'片段要点：个人上下文与任务上下文。';}
     return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done',result:{content,model:'test-model',reasoningEffort:'medium',provider:'codex',threadId:body.conversation?'test-thread':undefined,sources:[],trace:[]}})+'\n'});
   }
   if(path==='/api/codex/status')data={authenticated:true,models:[{id:'test-model',name:'Test model',isDefault:true}]};
   if(path==='/api/feishu/status')data={enabled:false,projects:[],comments:{enabled:false}};
   if(path==='/api/podcasts/resolve')data={episodes:[{title:'测试播客'}]};
   if(path==='/api/podcasts/jobs'&&req.method()==='POST'){target=req.postDataJSON().projectId;data={id:'test-job'};}
   if(path==='/api/podcasts/jobs'&&req.method()==='GET')data=target?[{id:'test-job',title:'测试播客',status:'complete',message:'完成'}]:[];
   if(path==='/api/podcasts/jobs/test-job/result')data={projectId:target,document:doc,transcript};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin);await expect(page.locator('.node')).toHaveCount(5);
 const ask=async text=>{await page.getByRole('textbox',{name:'向画布 AI 提问'}).fill(text);await page.locator('#chat-send').click();await expect(page.locator('#chat-send')).toBeEnabled();};
 await ask('解释这份资料');await expect(page.locator('.chat-message.assistant')).toHaveCount(1);assert(requests[0].conversation.projectId);assert(requests[0].literature.pages.length);
 // Select only part of the answer, then use the selection action.
 await page.locator('.chat-message.assistant .chat-message-text').evaluate(el=>{const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,11);getSelection().removeAllRanges();getSelection().addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.locator('#chat-selection-node').click();await expect(page.locator('.node')).toHaveCount(6);await expect(page.locator('.node').last()).toContainText('这是依据材料的解释。');
 // Exercise browser drag payload and actual canvas drop handler.
 const transfer=await page.evaluateHandle(()=>new DataTransfer());await page.locator('.chat-message.assistant button').dispatchEvent('dragstart',{dataTransfer:transfer});await page.locator('#canvas').dispatchEvent('drop',{dataTransfer:transfer,clientX:950,clientY:400});await expect(page.locator('.node')).toHaveCount(7);
 await expect(page.locator('#save-status')).toContainText('已保存');await page.reload();await expect(page.locator('.node')).toHaveCount(7);await expect(page.locator('.chat-message')).toHaveCount(2);
 await page.locator('#chat-docs').uncheck();await page.locator('#chat-scope').selectOption('none');await ask('继续解释');assert.equal(requests[1].conversation.id,requests[0].conversation.id);assert.equal(requests[1].literature.pages.length,0);assert(requests[1].messages.some(m=>m.role==='assistant'));
 await page.locator('#podcast-button').click();await page.locator('#podcast-url').fill('https://example.com/episode');await page.locator('#podcast-start').click();await expect(page.locator('#project-name')).toHaveText('测试播客');await expect(page.locator('.node')).toHaveCount(0);await expect(page.locator('.chat-message')).toHaveCount(0);await expect(page.locator('#english-paper')).toContainText('00:20');
 await page.locator('#podcast-outline').click();await expect(page.locator('.node')).toHaveCount(2);assert.equal(outlineCalls,2);await expect(page.locator('#save-status')).toContainText('已保存');
 await page.locator('#projects-button').click();const entry=page.locator('.project-entry').filter({hasText:'测试播客'});const downloadPromise=page.waitForEvent('download');await entry.getByRole('button',{name:'下载完整备份',exact:true}).click();const download=await downloadPromise;const snapshot=JSON.parse(await readFile(await download.path(),'utf8'));validateDetails(validateProject(snapshot));assert.equal(snapshot.nodes[1].parentId,snapshot.nodes[0].id);assert.equal(snapshot.nodes[0].source.docId,'pod');assert.equal(snapshot.chat.messages.length,2);
 await page.locator('.project-entry').filter({hasText:'主动阅读'}).getByRole('button',{name:'打开项目',exact:true}).click();await expect(page.locator('.node')).toHaveCount(7);await expect(page.locator('.chat-message')).toHaveCount(4);
 assert.deepEqual(errors,[]);console.log('PASS: project chat context, selected text and drag-to-node, save/reload, conversation continuity, scoped context, separate podcast project, atomic hierarchical outline and valid backup');
}finally{await browser.close();await new Promise(r=>server.close(r));}
