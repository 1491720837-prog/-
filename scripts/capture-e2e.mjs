// Isolated browser regression: synthetic content only, no user profile or Feishu writes.
import {chromium,expect} from '@playwright/test';
import {capturePage} from '../browser-extension/capture.js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname;const file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/'))throw Error();res.setHeader('Content-Type',['.js','.mjs'].includes(extname(file))?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/capture/images'?{images:[{url:'https://example.com/figure.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aavsAAAAASUVORK5CYII='}]}:path==='/api/feishu/status'?{enabled:false,projects:[],comments:{enabled:false}}:{enabled:false,connected:false,available:false})});});
 await page.goto(origin);await expect(page.locator('.node')).toHaveCount(5);
 const article=await ctx.newPage();await article.setContent('<title>采集验证文章</title><article><h1>采集验证文章</h1><p>这是一篇用于验证采集的测试正文，必须保留。</p><img src="https://example.com/figure.png" width="300" height="150"><p>图片后面的解释也应该保留。</p><p style="display:none">隐藏内容不能采集</p><footer>导航不采集</footer></article>');
 const capture=await article.evaluate(capturePage);assert(!capture.text.includes('隐藏内容'));assert(!capture.text.includes('导航不采集'));assert.equal(capture.blocks.filter(x=>x.type==='image').length,1);
 await article.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('p'));const s=getSelection();s.removeAllRanges();s.addRange(r);});const selected=await article.evaluate(capturePage);assert.equal(selected.blocks.length,1);assert(selected.selection);
 capture.url='https://example.com/article';
 const id='d63b05f5-b9cd-4444-b3e3-1ef81f471fd9';
 await page.evaluate(({capture,id})=>window.postMessage({type:'folio-capture',id,capture},location.origin),{capture,id});
 await expect(page.locator('#capture-button')).toHaveText('采集箱 · 1');await page.reload();await expect(page.locator('#capture-button')).toHaveText('采集箱 · 1');
 await page.locator('#capture-button').click();await page.getByRole('button',{name:'保存到工作台',exact:true}).click();
 await expect(page.locator('#project-name')).toHaveText('采集验证文章');await expect(page.locator('#english-paper')).toContainText('图片后面的解释');await expect(page.locator('#english-paper img')).toHaveCount(1);await expect(page.locator('.node')).toHaveCount(0);
 if(await page.locator('#projects-button').getAttribute('aria-expanded')==='false')await page.locator('#projects-button').click();await expect(page.locator('#project-sidebar .project-entry')).toHaveCount(2);await expect(page.locator('#project-sidebar .project-entry').filter({hasText:'主动阅读'})).toContainText('5 个节点');
 await page.locator('#project-sidebar .project-entry').filter({hasText:'主动阅读'}).getByRole('button',{name:'打开项目',exact:true}).click();await expect(page.locator('.node')).toHaveCount(5);
 assert.deepEqual(errors,[]);console.log('PASS: visible article/selection extraction, image placement, durable capture inbox, separate project import, original nodes preserved');
}finally{await browser.close();await new Promise(r=>server.close(r));}
