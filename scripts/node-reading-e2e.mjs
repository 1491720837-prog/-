// Fresh browser profile and mocked services; never touches a real Folio project.
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createDemo} from '../dist/demo.js';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname,file=resolve('dist','.'+(path==='/'?'/index.html':path));if(!file.startsWith(resolve('dist')+'/'))throw Error();res.setHeader('Content-Type',['.js','.mjs'].includes(extname(file))?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1800,height:1100}}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,connected:false,available:false,projects:[],comments:{enabled:false}})}));
 await page.goto('http://127.0.0.1:'+server.address().port);await expect(page.locator('.node')).toHaveCount(5);
 const project=createDemo();project.title='节点阅读验证';project.nodes=[{...project.nodes[2],parentId:null,width:520,height:540,text:'## 标题\n1. **第一项**\n2. 第二项\n- 要点\n> 引用\n\n'+Array.from({length:100},(_,i)=>'第 '+i+' 段：编辑时保持阅读位置。').join('\n')}];project.edges=[];
 await page.locator('#file-input').setInputFiles({name:'node.folio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.locator('#restore-project').click();await expect(page.locator('#node-count')).toHaveText('1');
 await page.locator('#outline-button').click();await page.locator('[data-outline="quote"]').click();
 const card=page.locator('[data-node-id="quote"]'),body=card.locator('.node-body');
 await expect(card.locator('h2')).toHaveText('标题');await expect(card.locator('ol li')).toHaveCount(2);await expect(card.locator('b')).toHaveText('第一项');await expect(card.locator('blockquote')).toContainText('引用');
 await card.locator('.node-text').dblclick();const input=card.locator('textarea');await expect(input).toBeVisible();
 // Place the caret midway through a long note and scroll that portion into view.
 await input.evaluate(el=>{const pos=el.value.indexOf('第 45 段');el.setSelectionRange(pos,pos);const b=el.closest('.node-body');b.scrollTop=45*parseFloat(getComputedStyle(el).lineHeight);});
 const before=await body.evaluate(e=>e.scrollTop);assert(before>500);
 for(let i=0;i<3;i++)await input.press('Enter');
 const after=await body.evaluate(e=>e.scrollTop);assert(Math.abs(after-before)<150,`scroll jumped: ${before} -> ${after}`);
 await input.press('Escape');await expect(card.locator('h2')).toBeVisible();const finished=await body.evaluate(e=>e.scrollTop);assert(finished>500);
 // Other node changes/rendering must not throw a reader back to the beginning.
 await card.locator('.node-origin').click();await expect(page.locator('#english-paper [data-section="question"]')).toBeVisible();assert(await body.evaluate(e=>e.scrollTop)>500);
 await expect(page.locator('.highlight-rect.focused').first()).toBeAttached();assert.equal(await page.locator('.highlight-layer').first().evaluate(e=>getComputedStyle(e).mixBlendMode),'multiply');
 await card.locator('.node-text').dblclick();await input.fill('选择这句话');await input.selectText();await card.getByRole('button',{name:'加粗',exact:true}).click();await expect(input).toHaveValue('**选择这句话**');await input.press('Escape');await expect(card.locator('.node-text b')).toHaveText('选择这句话');
 await expect(page.locator('#save-status')).toContainText('已保存');await page.reload();await expect(page.locator('.node-text b')).toHaveText('选择这句话');
 await mkdir('artifacts/ui-review',{recursive:true});await page.screenshot({path:'artifacts/ui-review/node-reading.png'});
 assert.deepEqual(errors,[]);console.log('PASS: Markdown display, stable Enter/finish/render scroll, source jump, readable highlight composition, toolbar formatting and persistence');
} finally {await browser.close();await new Promise(r=>server.close(r));}
