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
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,connected:false,available:false,projects:[],comments:{enabled:false}})}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const sidebar=page.locator('#project-sidebar'),rows=sidebar.locator('.project-entry');
 await expect(sidebar).toBeVisible();await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('主动阅读');
 await expect(page.locator('#projects-button')).toHaveCount(1);
 await page.locator('#projects-collapse').click();await expect(sidebar).toBeHidden();
 await page.reload();await expect(sidebar).toBeHidden();
 await page.locator('#projects-button').click();await expect(sidebar).toBeVisible();
 await page.locator('#new-project').click();await page.locator('#new-project-title').fill('播客讨论');await page.locator('#create-project').click();
 await expect(page.locator('#project-name')).toHaveText('播客讨论');await expect(rows).toHaveCount(2);await expect(page.locator('.node')).toHaveCount(0);
 await rows.filter({hasText:'主动阅读'}).getByRole('button',{name:'打开项目',exact:true}).click();
 await expect(page.locator('.node')).toHaveCount(5);
 // A rename followed immediately by switching must preserve the edited project.
 await page.locator('#project-name').click();await page.locator('#project-title-input').fill('第一篇论文');await page.locator('#rename-project').click();
 await rows.filter({hasText:'播客讨论'}).getByRole('button',{name:'打开项目',exact:true}).click();await expect(page.locator('#project-name')).toHaveText('播客讨论');
 await expect(rows.filter({hasText:'第一篇论文'})).toHaveCount(1);
 const search=page.getByRole('searchbox',{name:'搜索项目或资料'});
 await search.fill('第一篇');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('5 个节点');
 await search.fill('不存在的项目');await expect(rows).toHaveCount(0);await expect(sidebar).toContainText('没有找到匹配');
 await search.press('Escape');await expect(rows).toHaveCount(2);
 await search.fill('From reading');await expect(rows).toHaveCount(2);await search.fill('');
 await rows.filter({hasText:'第一篇论文'}).getByRole('button',{name:'打开项目',exact:true}).click();await expect(page.locator('.node')).toHaveCount(5);
 const pending=page.waitForEvent('download');await rows.filter({hasText:'第一篇论文'}).getByRole('button',{name:'下载完整备份',exact:true}).click();
 const downloaded=await pending,backup=JSON.parse(await readFile(await downloaded.path(),'utf8'));assert.equal(backup.title,'第一篇论文');assert.equal(backup.nodes.length,5);assert(!backup.config);
 await page.reload();await expect(sidebar).toBeVisible();await expect(page.locator('#project-name')).toHaveText('第一篇论文');await expect(rows).toHaveCount(2);
 await page.locator('#outline-button').click();await expect(page.locator('#canvas-outline')).toBeVisible();await expect(sidebar).toBeVisible();await page.locator('[data-outline="quote"]').click();await expect(page.locator('[data-node-id="quote"]')).toHaveClass(/selected/);
 await page.setViewportSize({width:800,height:900});await expect(sidebar).toBeVisible();assert.equal(await sidebar.evaluate(e=>getComputedStyle(e).position),'absolute');await page.locator('#projects-collapse').click();await expect(sidebar).toBeHidden();
 await page.setViewportSize({width:1600,height:1000});await page.locator('#projects-button').click();
 await mkdir('artifacts/ui-review',{recursive:true});await page.screenshot({path:'artifacts/ui-review/project-sidebar.png'});
 assert.deepEqual(errors,[]);console.log('PASS: project directory, persistent collapse, new project, safe switching/rename, search by project/material, backup, reload, independent canvas outline, narrow-screen overlay');
} finally {await browser.close();await new Promise(r=>server.close(r));}
