// Fresh browser profile and mocked services; never touches a real Folio project.
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {searchPages,readPage,validateCorpus} from './literature-context.mjs';
import {validateDetails,validateProject} from '../dist/model.js';
import {createDemo} from '../dist/demo.js';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname,file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/'))throw Error();res.setHeader('Content-Type',['.js','.mjs'].includes(extname(file))?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[],requests=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/api/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(['/api/codex/chat','/api/chat'].includes(path)){
   const body=r.request().postDataJSON();requests.push(body);validateCorpus(body.literature.pages);
   const result={content:'已核对项目原始资料。',model:'test',provider:path.includes('codex')?'codex':'api',sources:[],trace:[]};
   return r.fulfill({contentType:path.includes('codex')?'application/x-ndjson':'application/json',body:path.includes('codex')?JSON.stringify({type:'done',result})+'\n':JSON.stringify(result)});
  }
  return r.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,connected:false,available:false,projects:[],comments:{enabled:false}})});
 });
 await page.goto(origin);await expect(page.locator('.node')).toHaveCount(5);
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=4;i++)pdf.addPage().drawText(i===4?'ORCHID-27 full PDF evidence':'Source page '+i,{font,size:16,x:50,y:700});
 const transcript='00:01 原始逐字稿内容。\n'.repeat(6000)+'02:00:00 LATE-TRANSCRIPT-EVIDENCE';
 const project=createDemo();project.title='原始资料验证';project.nodes=[];project.edges=[];project.canvasLayout='mindmap-lr-v1';
 project.docs=[{id:'pdf-test',name:'原文PDF',type:'pdf',pages:4,data:Buffer.from(await pdf.save()).toString('base64'),translations:{}},{id:'pod-test',name:'完整播客',type:'text',contentKind:'podcast',provenance:{sourceUrl:'https://example.com/podcast',minuteUrl:'https://example.feishu.cn/minutes/test'},pages:1,text:transcript,translations:{}},{id:'article-test',name:'收藏文章',type:'text',contentKind:'article',provenance:{sourceUrl:'https://example.com/article'},pages:1,text:'ARTICLE-ORIGINAL-EVIDENCE 未选中文章也应能读取。',translations:{}}];project.activeDoc='article-test';project.page=1;
 const importProject=async p=>{validateDetails(validateProject(p));await page.locator('#file-input').setInputFiles({name:'sources.folio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.locator('#restore-project').click();await expect(page.locator('#project-name')).toHaveText(p.title);};
 await importProject(project);await expect(page.locator('#chat-docs')).toHaveCount(0);
 const ask=async text=>{await page.locator('#board-chat-input').fill(text);await page.locator('#chat-send').click();await expect(page.locator('#chat-send')).toBeEnabled({timeout:20000});};
 const verify=body=>{
  const pages=body.literature.pages;assert.equal(new Set(pages.map(p=>p.docId)).size,3);
  const hit=searchPages(pages,{query:'ORCHID-27'})[0];assert.equal(hit.page,4);assert.match(readPage(pages,hit).text,/ORCHID-27/);
  assert.equal(pages.filter(p=>p.docId==='pod-test').map(p=>p.text).join(''),transcript);
  const tail=searchPages(pages,{query:'LATE-TRANSCRIPT-EVIDENCE'})[0];assert(tail);assert.equal(tail.docId,'pod-test');
  assert(pages.some(p=>p.text.includes('ARTICLE-ORIGINAL-EVIDENCE')));
 };
 for(const scope of ['none','selected','all']){await page.locator('#chat-scope').selectOption(scope);await ask('请结合原始资料解释 '+scope);verify(requests.at(-1));}
 await page.locator('.chat-message.assistant').last().getByText('本次可查阅的原始资料 · 3 份').click();await expect(page.locator('.chat-message.assistant').last()).toContainText('原文PDF · 4 页');
 await page.locator('#settings-button').click();await page.locator('#reading-provider').selectOption('api');await page.locator('#api-endpoint').fill('/api/chat');await page.locator('#save-settings').click();
 await ask('API 也必须能读取完整资料');verify(requests.at(-1));
 // Blank scanned PDF must fail explicitly instead of sending only titles to the model.
 const blank=await PDFDocument.create();blank.addPage();const unavailable=createDemo();unavailable.title='扫描件验证';unavailable.nodes=[];unavailable.edges=[];unavailable.docs=[{id:'blank',name:'未OCR扫描件',type:'pdf',pages:1,data:Buffer.from(await blank.save()).toString('base64'),translations:{}}];unavailable.activeDoc='blank';
 await importProject(unavailable);const count=requests.length;await ask('这篇论文说什么？');assert.equal(requests.length,count);await expect(page.locator('.chat-error').last()).toContainText('OCR');
 assert.deepEqual(errors,[]);console.log('PASS: actual PDF extraction beyond visible page, complete transcript tail, unselected article, all canvas scopes, Codex/API payloads, source evidence and unreadable PDF blocks sending');
} finally {await browser.close();await new Promise(r=>server.close(r));}
