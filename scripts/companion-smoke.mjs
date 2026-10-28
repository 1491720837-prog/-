// Opt-in integration check: uses the locally signed-in Codex for one synthetic question.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCloudServer} from './cloud-server.mjs';
import {passwordHash} from './cloud-auth.mjs';
import {atomicJSON} from './cloud-store.mjs';
const root=await mkdtemp(join(tmpdir(),'folio-companion-smoke-')),port=4331,origin='http://127.0.0.1:'+port;
const app=await createCloudServer({env:{FOLIO_PUBLIC_URL:origin,FOLIO_DATA_DIR:join(root,'cloud'),FOLIO_SESSION_SECRET:'smoke-test-secret-'.repeat(3),FOLIO_PASSWORD_HASH:passwordHash('smoke-test-only')}});
await new Promise(r=>app.server.listen(port,'127.0.0.1',r));let child;
try{
  const pair=await app.devices.pair(),device=await app.devices.register(pair.code,'Synthetic integration Mac');
  const dir=join(root,'companion');await mkdir(dir);await atomicJSON(join(dir,'connection.json'),{origin,...device});
  child=spawn(process.execPath,['scripts/companion.mjs'],{env:{...process.env,FOLIO_COMPANION_DATA:dir},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  let online;for(let i=0;i<90;i++){online=(await app.devices.list()).find(d=>d.id===device.id&&d.online&&d.capabilities.codex);if(online)break;await new Promise(r=>setTimeout(r,1000));}
  if(!online)throw Error('Local companion did not advertise an authenticated Codex');
  const job=await app.devices.create(device.id,'codex',{messages:[{role:'user',content:'This is a connection test, not a research task. Reply with exactly: Folio connection ready.'}],literature:{pages:[]}});
  const result=await app.devices.wait(job.id,AbortSignal.timeout(330000));
  if(!result.content?.includes('Folio connection ready'))throw Error('Unexpected model answer');
  console.log(JSON.stringify({ok:true,provider:result.provider,model:result.model,reasoningEffort:result.reasoningEffort}));
}finally{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,8000))]);if(child.exitCode===null)child.kill('SIGKILL');}
  await new Promise(r=>app.server.close(r));await rm(root,{recursive:true,force:true});
}
