import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCloudServer} from './cloud-server.mjs';
import {passwordHash} from './cloud-auth.mjs';
import {createDemo} from '../dist/demo.js';
const root=await mkdtemp(join(tmpdir(),'folio-cloud-e2e-')),port=Number(process.env.FOLIO_TEST_PORT||4327),origin='http://127.0.0.1:'+port;
const app=await createCloudServer({env:{FOLIO_PUBLIC_URL:origin,FOLIO_DATA_DIR:root,FOLIO_SESSION_SECRET:'ephemeral-test-secret-'.repeat(3),FOLIO_PASSWORD_HASH:passwordHash('ephemeral-test-password')}});
const project=createDemo();project.projectId='e2e';project.canvasLayout='mindmap-lr-v1';await app.store.put(project);
await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),contexts=[],errors=[];
try{
  for(let i=0;i<2;i++){
    const context=await browser.newContext({viewport:{width:1600,height:1000}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await expect(page).toHaveURL(/login\.html/);
    await page.getByLabel('工作台密码').fill('ephemeral-test-password');await page.getByRole('button',{name:'打开工作台'}).click();
    await expect(page.locator('.node')).toHaveCount(5);await page.waitForTimeout(600);
  }
  const [one,two]=contexts.map(c=>c.pages()[0]);
  await one.locator('#project-name').click();await one.locator('#project-title-input').fill('两台设备共同的项目');await one.locator('#rename-project').click();
  await expect.poll(async()=>(await app.store.get('e2e')).project.title).toBe('两台设备共同的项目');
  await expect(two.locator('#project-name')).toHaveText('两台设备共同的项目',{timeout:20000});
  const manager=await contexts[0].newPage();await manager.goto(origin+'/online.html');
  await expect(manager.locator('#mode')).toContainText('在线版');await manager.locator('#pair').click();await expect(manager.locator('#pair-code')).toContainText('五分钟');
  await manager.locator('#history').click();await expect(manager.locator('#versions button').first()).toBeVisible();
  const downloadPromise=manager.waitForEvent('download');await manager.locator('#export').click();const download=await downloadPromise;await expect(download.suggestedFilename()).toContain('Folio-全部项目');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: login, cloud save, second-device refresh, device pairing UI, history, full backup download');
}finally{await browser.close();await new Promise(r=>app.server.close(r));await rm(root,{recursive:true,force:true});}
