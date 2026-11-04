import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicURL,publicIP,publicStream} from '../scripts/public-network.mjs';
import {parsePodcastPage,resolvePodcast,canonicalPodcastURL} from '../scripts/podcast-source.mjs';
import {PodcastJobs,minuteToken} from '../scripts/podcast-jobs.mjs';
import {podcastDocument,articleDocument,textCorpus} from '../dist/content-source.js';
import {createDemo} from '../dist/demo.js';
import {validateProject,validateDetails,sourceCitation} from '../dist/model.js';
import {projectSnapshot,renderProject} from '../dist/feishu-format.js';
import {validateCorpus,pageLabel} from '../scripts/literature-context.mjs';

test('public fetch blocks local/private addresses, DNS rebinding targets and credentials before opening sockets',async()=>{
  for(const url of ['http://localhost/','http://2130706433/','http://[::1]/','http://[::ffff:127.0.0.1]/','http://169.254.169.254/','https://u:p@example.com/','file:///etc/passwd','http://example.com:8080/'])assert.throws(()=>publicURL(url));
  for(const ip of ['127.1.2.3','10.1.2.3','172.17.0.1','192.168.2.1','100.64.0.1','::1','fc00::1'])assert.equal(publicIP(ip),false);
  assert.equal(publicIP('8.8.8.8'),true);assert.equal(publicIP('2606:4700:4700::1111'),true);
  await assert.rejects(publicStream('https://example.com',{resolveDNS:async()=>[{address:'127.0.0.1',family:4}]}),/非公开/);
});
test('resolves the exact public episode, rejects private media, separates RSS candidates and ignores show notes as transcript',async()=>{
  const e={eid:'abc123',title:'节目',duration:300,media:{source:{mode:'PUBLIC',url:'https://cdn.example.com/a.m4a'}},podcast:{title:'播客'}},html=x=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{episode:x}}})+'</script>';
  const url='https://www.xiaoyuzhoufm.com/episode/abc123?s=tracking';assert.equal(canonicalPodcastURL(url),url.split('?')[0]);
  const found=parsePodcastPage(html(e),url);assert.equal(found[0].audioUrl,e.media.source.url);assert.equal(found[0].duration,300);
  assert.throws(()=>parsePodcastPage(html({...e,isPrivateMedia:true}),url),/公开/);
  assert.throws(()=>parsePodcastPage(html({...e,eid:'other'}),url),/不匹配/);
  const rss='<rss><channel><item><title>第一集</title><enclosure url="https://cdn.example.com/1.mp3"/></item><item><title>第二集</title><enclosure url="https://cdn.example.com/2.mp3"/></item></channel></rss>';
  assert.equal(parsePodcastPage(rss,'https://example.com/feed.xml').length,2);
  assert.equal(parsePodcastPage('<audio src="/podcast.mp3"></audio>','https://example.com/episode')[0].audioUrl,'https://example.com/podcast.mp3');
  await assert.rejects(resolvePodcast('https://example.com/episode',{read:async()=>({text:'<p>Only a summary</p>'})}),/未找到公开音频/);
});
async function temp(fn){const root=await mkdtemp(join(tmpdir(),'folio-podcast-test-'));let jobs;try{await fn(root,s=>jobs=s);}finally{jobs?.stop();if(jobs)for(let i=0;i<100&&jobs.active.size;i++)await new Promise(r=>setTimeout(r,5));await rm(root,{recursive:true,force:true});}}
async function done(jobs,id){for(let i=0;i<200;i++){const j=await jobs.get(id);if(['complete','failed','review'].includes(j.status))return j;await new Promise(r=>setTimeout(r,10));}throw Error('Test timed out');}
test('transcription persists target, uses upload then minutes, waits for actual transcript and deduplicates a repeated import',()=>temp(async(root,set)=>{
  const calls=[];let polls=0;
  const jobs=new PodcastJobs({root,pollMs:5,resolveSource:async()=>[{title:'测试单集',audioUrl:'https://cdn.example.com/a.mp3',duration:5}],download:async(_url,file)=>writeFile(file,'test audio'),run:async args=>{
    calls.push(args);if(args[0]==='drive')return {file_token:'uploaded'};
    if(args[1]==='+upload')return {minute_url:'https://example.feishu.cn/minutes/obc123'};
    if(++polls===1)return {minutes:[{minute_token:'obc123',status:'processing',retryable:true}]};
    const dir=args[args.indexOf('--output-dir')+1],file=join(dir,'transcript.txt');await writeFile(file,'说话人 1 00:01\n这是实际逐字稿。');return {minutes:[{minute_token:'obc123',artifacts:{transcript_file:file}}]};
  }});set(jobs);
  const j=await jobs.create({url:'https://example.com/episode',projectId:'target'});assert.equal((await jobs.create({url:'https://example.com/episode',projectId:'target'})).id,j.id);
  assert.equal((await done(jobs,j.id)).status,'complete');const result=await jobs.result(j.id);assert.equal(result.projectId,'target');assert.ok(result.transcript.includes('实际逐字稿'));assert.equal(result.document.provenance.transcription,'feishu-minutes');
  assert.equal(calls.filter(a=>a[0]==='drive').length,1);assert.ok(polls>=2);
  const restored=new PodcastJobs({root});await restored.ready;assert.equal((await restored.result(j.id)).document.id,result.document.id);restored.stop();
}));
test('uncertain Feishu writes require review and never automatically re-upload on restart',()=>temp(async(root,set)=>{
  let writes=0;const jobs=new PodcastJobs({root,resolveSource:async()=>[{title:'测试',audioUrl:'https://cdn.example.com/a.mp3'}],download:async()=>{},run:async()=>{writes++;throw Error('timeout');}});set(jobs);
  const j=await jobs.create({url:'https://example.com/e',projectId:'p'});assert.equal((await done(jobs,j.id)).status,'review');await assert.rejects(jobs.retry(j.id));jobs.stop();
  const restored=new PodcastJobs({root,run:async()=>{writes++;}});await restored.ready;assert.equal((await restored.get(j.id)).status,'review');assert.equal(writes,1);restored.stop();
}));
test('existing minute import does not upload audio and rejects transcript files outside the job folder',()=>temp(async(root,set)=>{
  const file=join(root,'outside.txt');await writeFile(file,'unrelated private data');
  const jobs=new PodcastJobs({root,run:async args=>{assert.equal(args[1],'+detail');return {minutes:[{artifacts:{transcript_file:file}}]};}});set(jobs);
  const j=await jobs.create({url:'https://example.feishu.cn/minutes/obc123',projectId:'p'});assert.equal((await done(jobs,j.id)).status,'failed');await assert.rejects(jobs.result(j.id));
  assert.throws(()=>minuteToken('https://evil.example/minutes/x'));
}));
test('podcast provenance and article snapshots survive save/export; long transcript chunks retain all text without fake PDF page citations',()=>{
  const doc=podcastDocument({id:'pod',title:'播客',text:'00:01 内容\n'.repeat(20000),sourceUrl:'https://example.com/episode',minuteUrl:'https://example.feishu.cn/minutes/obc123',jobId:'job'}),state=createDemo(),before=state.nodes.length;
  state.docs.push(doc);validateDetails(validateProject(JSON.parse(JSON.stringify(state))));assert.equal(state.nodes.length,before);
  const corpus=validateCorpus(textCorpus(doc));assert.equal(corpus.map(p=>p.text).join(''),doc.text);assert.ok(corpus.every(p=>p.text.length<=80000));assert.ok(pageLabel(corpus[0]).includes('非页码'));
  assert.ok(sourceCitation(state,{docId:'pod',page:1}).includes('逐字稿'));
  state.nodes[0].source={docId:'pod',page:1,text:'00:01 内容'};const xml=renderProject(projectSnapshot(state));assert.ok(xml.includes('https://example.feishu.cn/minutes/obc123'));assert.ok(xml.includes('播客逐字稿'));
  assert.throws(()=>articleDocument({text:'你好内容'.repeat(10),url:'javascript:alert(1)'},'article'));
  const article=articleDocument({title:'文章',text:'正文'.repeat(20),url:'https://example.com/a',blocks:[{type:'text',text:'正文'},{type:'image',url:'javascript:alert(1)'}]},'article');assert.equal(article.contentBlocks.length,1);
});

test('transcriptParts keeps every chunk aligned and parses headings and turn headers',async()=>{
  const {transcriptParts}=await import('../dist/content-source.js');
  const text='2026-10-28|2h\n\nSpeaker 1 00:00:17.290 \n哈喽，欢迎。\n\n# 话题一：开场\n\n## 小节A（00:00-04:40）\n\nSpeaker 2 00:00:54.980\n你好世界。';
  const parts=transcriptParts(text);
  assert.equal(parts[0].type,'text');assert.match(parts[0].text,/2026-10-28/);
  assert.equal(parts[1].type,'text');assert.match(parts[1].text,/哈喽，欢迎/);
  assert.equal(parts[2].type,'heading');assert.equal(parts[2].level,1);assert.equal(parts[2].text,'话题一：开场');
  assert.equal(parts[3].type,'heading');assert.equal(parts[3].level,2);assert.match(parts[3].text,/小节A/);
  assert.equal(parts[4].type,'text');assert.match(parts[4].text,/你好世界/);
  // 与原始按空行切分的块数一致(标题也占一个索引)，保证 t<i> 定位不漂移
  assert.equal(parts.length,text.split(/\n\s*\n/).length);
});

test('articleDocument preserves downloaded image data and per-image errors',async()=>{
  const {articleDocument}=await import('../dist/content-source.js');
  const capture={title:'文章',url:'https://example.com/a',text:'正文内容'.repeat(10),author:'',blocks:[
    {type:'image',url:'https://mmbiz.qpic.cn/ok.jpg',data:'data:image/jpeg;base64,QUJD'},
    {type:'image',url:'https://mmbiz.qpic.cn/bad.jpg',error:'图片超过 2 MB'},
    {type:'text',text:'段落'},
  ]};
  const doc=articleDocument(capture,'article-x');
  assert.equal(doc.contentBlocks.length,3);
  assert.equal(doc.contentBlocks[0].data,'data:image/jpeg;base64,QUJD');
  assert.equal(doc.contentBlocks[1].error,'图片超过 2 MB');
});
