import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rename,readdir,realpath} from 'node:fs/promises';
import {resolve,join,sep,extname,dirname,basename,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {resolvePodcast,canonicalPodcastURL} from './podcast-source.mjs';
import {downloadAudio,publicURL} from './public-network.mjs';
import {podcastDocument} from '../dist/content-source.js';
const exec=promisify(execFile),safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
export function minuteToken(url){const u=publicURL(url);if(!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname)||!/^\/minutes\/[a-zA-Z0-9]+\/?$/.test(u.pathname))throw Error('请输入有效的飞书妙记链接');return u.pathname.split('/').filter(Boolean).at(-1);}
async function cli(args){
  args=[...args];let cwd=process.cwd();
  const output=args.indexOf('--output-dir'),input=args.indexOf('--file');
  if(output>=0){cwd=resolve(args[output+1]);args[output+1]='.';}
  else if(input>=0&&isAbsolute(args[input+1])){cwd=dirname(args[input+1]);args[input+1]=basename(args[input+1]);}
  // Podcasts stay on the user identity on purpose: 飞书妙记 belongs to whoever
  // uploads it, and the transcript has to stay in your own 妙记 space.
  let result;try{result=await exec(process.env.FOLIO_LARK_BIN||'lark-cli',[...args,'--as','user','--format','json'],{cwd,timeout:20*60*1000,maxBuffer:8e6,env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1',LARKSUITE_CLI_NO_SKILLS_NOTIFIER:'1'}});}catch(e){let j;try{j=JSON.parse(e.stdout);}catch{try{j=JSON.parse(e.stderr);}catch{}}if(j?.data?.minutes?.length&&j.data.minutes.every(m=>m.status==='processing'&&m.retryable))return j.data;throw Error(j?.error?.message||j?.data?.minutes?.[0]?.error||'飞书请求失败或超时，请检查授权及任务状态后重试');}
  let j;try{j=JSON.parse(result.stdout);}catch{throw Error('飞书没有返回有效结果，请先核对云端是否已创建文件');}
  if(j.ok!==true)throw Error(j.error?.message||'飞书操作未完成');
  for(const minute of j.data?.minutes||[]){const file=minute.artifacts?.transcript_file;if(file)minute.artifacts.transcript_file=resolve(cwd,file);}
  return j.data;
}
export class PodcastJobs {
  constructor({root=resolve('artifacts/podcast-jobs'),run=cli,resolveSource=resolvePodcast,download=downloadAudio,pollMs=30000,maxWaitMs=6*60*60*1000}={}){
    Object.assign(this,{root,run,resolveSource,download,pollMs,maxWaitMs});this.jobs=new Map();this.active=new Set();this.closed=false;this.ready=this.init();
  }
  async init(){await mkdir(this.root,{recursive:true});for(const name of await readdir(this.root)){if(!/^[a-f\d-]{36}$/.test(name))continue;try{const j=JSON.parse(await readFile(join(this.root,name,'job.json'),'utf8'));if(['uploading','creating'].includes(j.status)){j.status='review';j.message='服务在飞书写入期间中断。请核对云空间或妙记，使用已生成的妙记链接继续，避免重复创建。';}else if(['downloading','resolving','queued'].includes(j.status))j.status='queued';this.jobs.set(j.id,j);await this.save(j);}catch{}}
    setTimeout(()=>this.drain(),0).unref();
  }
  async save(j){j.updatedAt=new Date().toISOString();const value=JSON.stringify(j);this.saving||=Promise.resolve();const next=this.saving.catch(()=>{}).then(async()=>{const dir=join(this.root,j.id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'job.tmp'),value,{mode:0o600});await rename(join(dir,'job.tmp'),join(dir,'job.json'));});this.saving=next;return next;}
  view(j){return {id:j.id,projectId:j.projectId,title:j.title||'播客转写',sourceUrl:j.sourceUrl,minuteUrl:j.minuteUrl,status:j.status,message:j.message,createdAt:j.createdAt,updatedAt:j.updatedAt};}
  async list(projectId){await this.ready;return [...this.jobs.values()].filter(j=>!projectId||j.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(j=>this.view(j));}
  async get(id){await this.ready;const j=this.jobs.get(id);if(!j)throw Error('未找到播客任务');return this.view(j);}
  async create({url,projectId,episodeIndex,minuteUrl}={}){
    const selectedIndex=episodeIndex!==undefined;episodeIndex??=0;
    await this.ready;if(!safeId(projectId))throw Error('项目编号无效');
    const sourceUrl=canonicalPodcastURL(url);if(!Number.isInteger(episodeIndex)||episodeIndex<0||episodeIndex>199)throw Error('单集选择无效');
    let token;if(minuteUrl)token=minuteToken(minuteUrl);else if(/\/minutes\//.test(new URL(sourceUrl).pathname)){token=minuteToken(sourceUrl);minuteUrl=sourceUrl;}
    const key=createHash('sha256').update(JSON.stringify([projectId,sourceUrl,episodeIndex,token||''])).digest('hex');
    const existing=[...this.jobs.values()].find(j=>j.key===key);if(existing)return this.view(existing);
    if([...this.jobs.values()].filter(j=>['queued','resolving','downloading','uploading','creating','transcribing'].includes(j.status)).length>=10)throw Error('待处理任务已达 10 个，请等待完成后再导入');
    const j={id:randomUUID(),key,projectId,sourceUrl,episodeIndex,selectedIndex,minuteUrl,minuteToken:token,status:token?'transcribing':'queued',message:token?'正在读取飞书逐字稿':'等待获取公开音频',createdAt:new Date().toISOString()};
    this.jobs.set(j.id,j);await this.save(j);this.drain();return this.view(j);
  }
  async retry(id){await this.ready;const j=this.jobs.get(id);if(!j)throw Error('任务不存在');if(!['failed','cancelled'].includes(j.status))throw Error('此任务不能直接重试；写入结果不确定时请用已有妙记链接继续');if(this.active.has(id))throw Error('任务正在停止，请稍后重试');j.status=j.minuteToken?'transcribing':'queued';j.message='正在重试';j.waitStarted=Date.now();await this.save(j);this.drain();return this.view(j);}
  async cancel(id){await this.ready;const j=this.jobs.get(id);if(!j)throw Error('任务不存在');if(['uploading','creating'].includes(j.status))throw Error('飞书写入进行中，请稍后停止；不能在结果不确定时重复提交');if(j.status==='complete')return this.view(j);j.status='cancelled';j.message='已停止后续处理；已上传的飞书文件及妙记保留';this.controllers?.get(id)?.abort();await this.save(j);return this.view(j);}
  async result(id){await this.ready;const j=this.jobs.get(id);if(j?.status!=='complete')throw Error('逐字稿尚未完成');return JSON.parse(await readFile(join(this.root,id,'result.json'),'utf8'));}
  drain(){if(this.closed)return;for(const j of this.jobs.values()){if(this.active.size>=2)break;if(this.active.has(j.id)||!['queued','transcribing'].includes(j.status))continue;this.active.add(j.id);this.process(j).finally(()=>{this.active.delete(j.id);this.drain();});}}
  async phase(j,status,message){j.status=status;j.message=message;await this.save(j);}
  async process(j){
    const dir=join(this.root,j.id),controller=new AbortController();this.controllers||=new Map();this.controllers.set(j.id,controller);
    const live=()=>{controller.signal.throwIfAborted();if(this.closed||j.status==='cancelled')throw Error('任务已停止');};
    try{
      if(!j.minuteToken){
        if(!j.source){await this.phase(j,'resolving','正在解析公开播客链接');const options=await this.resolveSource(j.sourceUrl);live();if(options.length>1&&j.episodeIndex===0&&!j.selectedIndex)throw Error('链接包含多集节目，请使用单集链接，或先选择具体集数');j.source=options[j.episodeIndex];if(!j.source)throw Error('找不到所选单集');j.title=j.source.title;await this.save(j);}
        if(j.source.duration>21600)throw Error('飞书妙记不支持超过 6 小时的单个音频');
        if(!j.fileToken){const ext=extname(new URL(j.source.audioUrl).pathname).toLowerCase(),file=join(dir,'audio'+(/\.(mp3|m4a|aac|wav|ogg|amr)$/.test(ext)?ext:'.m4a'));
          await this.phase(j,'downloading','正在下载公开音频');await this.download(j.source.audioUrl,file,{signal:controller.signal});live();
          await this.phase(j,'uploading','正在上传音频到你的飞书云空间');const upload=await this.run(['drive','+upload','--file',file,'--name',j.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,120)+extname(file)]);if(!upload.file_token)throw Error('上传结果缺少 file_token，请核对飞书云空间');j.fileToken=upload.file_token;await this.save(j);
        }
        await this.phase(j,'creating','正在创建飞书妙记');const minute=await this.run(['minutes','+upload','--file-token',j.fileToken]);j.minuteUrl=minute.minute_url;if(!j.minuteUrl)throw Error('飞书未返回妙记链接，请核对妙记列表');j.minuteToken=minuteToken(j.minuteUrl);await this.phase(j,'transcribing','飞书正在转写音频，关闭窗口后可回来查看');
      }
      j.waitStarted||=Date.now();await this.save(j);
      while(Date.now()-j.waitStarted<this.maxWaitMs){
        live();const detail=await this.run(['minutes','+detail','--minute-tokens',j.minuteToken,'--transcript','--output-dir',dir,'--overwrite']);live();
        const minute=detail.minutes?.find(m=>m.minute_token===j.minuteToken)||detail.minutes?.[0];
        const file=minute?.artifacts?.transcript_file;
        if(file&&minute.status!=='processing'){const actual=await realpath(resolve(file)),base=await realpath(dir);if(!actual.startsWith(base+sep))throw Error('飞书逐字稿输出路径超出任务目录');
          const transcript=(await readFile(actual,'utf8')).trim();if(transcript){
            j.title=j.title||minute.title||'播客逐字稿';const document=podcastDocument({id:'podcast-'+j.id,title:j.title,text:transcript,sourceUrl:j.sourceUrl,minuteUrl:j.minuteUrl,jobId:j.id,duration:j.source?.duration});
            const result={projectId:j.projectId,document,transcript,minuteUrl:j.minuteUrl};await writeFile(join(dir,'result.json'),JSON.stringify(result),{mode:0o600});await this.phase(j,'complete','逐字稿已完成，可以导入工作台或下载文字稿');return;
          }
        }
        await this.phase(j,'transcribing','飞书尚未返回完整逐字稿，继续等待');await new Promise(resolve=>{const done=()=>{clearTimeout(t);controller.signal.removeEventListener('abort',done);resolve();};const t=setTimeout(done,this.pollMs);controller.signal.addEventListener('abort',done,{once:true});});
      }
      throw Error('等待转写超过 6 小时，已保留妙记链接，可稍后重试读取');
    }catch(e){if(this.closed)return;if(j.status==='cancelled')return;const uncertain=['uploading','creating'].includes(j.status);await this.phase(j,uncertain?'review':'failed',uncertain?'飞书写入结果需要核对：'+e.message+'。不要重复上传；可用已生成的妙记链接继续。':e.message).catch(()=>{});
    }finally{this.controllers.delete(j.id);}
  }
  stop(){this.closed=true;for(const c of this.controllers?.values()||[])c.abort();}
}
export async function podcastRoute(jobs,path,method,payload={},query=new URLSearchParams()){
  if(path==='/api/podcasts/resolve'&&method==='POST')return {episodes:await jobs.resolveSource(payload.url)};
  if(path==='/api/podcasts/jobs'&&method==='POST')return jobs.create(payload);
  if(path==='/api/podcasts/jobs'&&method==='GET')return jobs.list(query.get('projectId'));
  const match=path.match(/^\/api\/podcasts\/jobs\/([a-f\d-]{36})(?:\/(result|retry|cancel))?$/);
  if(match){if(method==='GET'&&!match[2])return jobs.get(match[1]);if(method==='GET'&&match[2]==='result')return jobs.result(match[1]);if(method==='POST'&&match[2]==='retry')return jobs.retry(match[1]);if(method==='POST'&&match[2]==='cancel')return jobs.cancel(match[1]);}
  throw Object.assign(Error('没有这个播客接口'),{status:404});
}
