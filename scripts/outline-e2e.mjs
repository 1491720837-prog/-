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
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,connected:false,available:false,projects:[],comments:{enabled:false}})}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await expect(page.locator('.node')).toHaveCount(5);
 await expect(page.locator('.rail')).toHaveCount(0);
 await page.locator('#outline-button').click();
 await expect(page.locator('#canvas-outline')).toBeVisible();
 await expect(page.locator('#drawer')).not.toHaveClass(/open/);
 assert.deepEqual(await page.locator('[data-outline]').evaluateAll(els=>els.map(e=>e.dataset.outline)),['goal','quote','method','connection','thought']);
 await page.locator('[data-outline="goal"]').click();
 await expect(page.locator('#canvas-outline')).toBeHidden();
 await page.locator('[data-collapse="goal"]').click();
 await expect(page.locator('[data-node-id="quote"]')).toHaveCount(0);
 // A hidden descendant is still navigable from the full outline.
 await page.locator('#outline-button').click();await page.locator('[data-outline="quote"]').click();
 const node=page.locator('[data-node-id="quote"]');await expect(node).toBeVisible();await expect(node).toHaveClass(/selected/);await expect(node).toBeFocused();
 const n=await node.boundingBox(),c=await page.locator('#canvas').boundingBox();
 assert(Math.abs(n.x+n.width/2-c.x-c.width/2)<3);assert(Math.abs(n.y+n.height/2-c.y-c.height/2)<3);
 await expect(page.locator('#save-status')).toContainText('已保存');await page.reload();await expect(page.locator('[data-node-id="quote"]')).toBeVisible();
 await page.locator('#outline-button').click();await page.keyboard.press('Escape');await expect(page.locator('#canvas-outline')).toBeHidden();await expect(page.locator('#outline-button')).toBeFocused();
 await page.locator('#library-button').click();await expect(page.locator('#drawer')).toContainText('文献库');await page.keyboard.press('Escape');
 await page.locator('#help-button').click();await expect(page.locator('#modal')).toBeVisible();await page.keyboard.press('Escape');
 await page.locator('#settings-button').click();await expect(page.locator('#modal')).toBeVisible();await page.keyboard.press('Escape');
 // Import synthetic many-node project through the normal file input.
 const many=createDemo();many.title='大纲滚动验证';many.nodes=Array.from({length:50},(_,i)=>({...many.nodes[0],id:'test-'+i,title:`测试节点 ${i}`,x:20,y:100+i*240}));many.edges=[];
 await page.locator('#file-input').setInputFiles({name:'outline-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(many))});
 await page.locator('#restore-project').click();
 await expect(page.locator('#node-count')).toHaveText('50');
 await page.locator('#outline-button').click();await expect(page.locator('[data-outline]')).toHaveCount(50);
 const before=await page.locator('#canvas-world').getAttribute('style');await page.locator('#outline-list').hover();await page.mouse.wheel(0,600);
 await expect.poll(()=>page.locator('#outline-list').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 assert.equal(await page.locator('#canvas-world').getAttribute('style'),before);
 await page.setViewportSize({width:1000,height:800});
 await expect(page.locator('#canvas-outline')).toBeVisible();
 const panel=await page.locator('#canvas-outline').boundingBox(),canvas=await page.locator('#canvas').boundingBox();assert(panel.x>=canvas.x&&panel.x+panel.width<=canvas.x+canvas.width+1);
 await page.setViewportSize({width:1600,height:1000});
 await mkdir('artifacts/ui-review',{recursive:true});await page.screenshot({path:'artifacts/ui-review/canvas-outline.png'});
 await page.locator('#outline-close').click();
 const empty=createDemo();empty.title='空画布验证';empty.nodes=[];empty.edges=[];
 await page.locator('#file-input').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty))});await page.locator('#restore-project').click();await expect(page.locator('#node-count')).toHaveText('0');
 await page.locator('#outline-button').click();await expect(page.locator('.outline-empty')).toContainText('还没有节点');
 assert.deepEqual(errors,[]);
 console.log('PASS: no rail, local hierarchical outline, hidden descendant jump/centering, persistence, keyboard close, retained tools, independent scrolling, narrow canvas and empty state');
} finally {await browser.close();await new Promise(r=>server.close(r));}
