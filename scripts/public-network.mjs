import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {createWriteStream} from 'node:fs';
import {rm} from 'node:fs/promises';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const denied=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])denied.addSubnet(ip,bits);
const v6=new BlockList();v6.addSubnet('2000::',3,'ipv6');
const denied6=new BlockList();denied6.addSubnet('2001:db8::',32,'ipv6');denied6.addSubnet('2002::',16,'ipv6');
export function publicIP(ip){return isIP(ip)===4?!denied.check(ip):isIP(ip)===6&&v6.check(ip,'ipv6')&&!denied6.check(ip,'ipv6');}
export function publicURL(value){
  let u;try{u=new URL(value);}catch{throw Error('请输入完整的公开链接');}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('只接受公开 HTTP / HTTPS 链接');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||isIP(host)&&!publicIP(host))throw Error('不能读取本机或内网地址');
  u.hash='';return u;
}
// Resolve once per hop and pin the socket to the checked address (including redirects).
export async function publicStream(value,{signal,resolveDNS=lookup,hops=0}={}){
  if(hops>5)throw Error('链接重定向次数过多');
  const u=publicURL(value),host=u.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolveDNS(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>!publicIP(x.address)))throw Error('链接解析到了非公开地址');
  signal?.throwIfAborted();const pinned=addresses[0];
  const response=await new Promise((resolve,reject)=>{
    const req=(u.protocol==='https:'?https:http).get(u,{signal,headers:{'User-Agent':'Folio/1.0 podcast-import','Accept-Encoding':'identity'},
      lookup:(_h,opts,cb)=>opts.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)},resolve);
    req.setTimeout(30000,()=>req.destroy(Error('读取公开链接超时')));req.on('error',reject);
  });
  if([301,302,303,307,308].includes(response.statusCode)){
    response.resume();if(!response.headers.location)throw Error('跳转地址缺失');
    return publicStream(new URL(response.headers.location,u).href,{signal,resolveDNS,hops:hops+1});
  }
  if(response.statusCode<200||response.statusCode>=300){response.resume();throw Error(`公开链接返回 ${response.statusCode}，可能已失效或需要登录`);}
  if(response.headers['content-encoding']&&!['identity'].includes(response.headers['content-encoding'])){response.destroy();throw Error('页面返回了不支持的压缩编码');}
  return {response,url:u.href,type:String(response.headers['content-type']||'').split(';')[0]};
}
export async function publicText(url,{signal,limit=5_000_000}={}){
  const r=await publicStream(url,{signal:signal||AbortSignal.timeout(60000)}),chunks=[];let size=0;
  for await(const chunk of r.response){size+=chunk.length;if(size>limit){r.response.destroy();throw Error('节目页面过大');}chunks.push(chunk);}
  return {...r,text:Buffer.concat(chunks).toString('utf8')};
}
export async function downloadAudio(url,file,{signal,limit=512*1024*1024}={}){
  const r=await publicStream(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20*60*1000)]):AbortSignal.timeout(20*60*1000)});
  if(Number(r.response.headers['content-length'])>limit){r.response.destroy();throw Error('音频超过当前 512 MB 导入上限');}
  let size=0,header=Buffer.alloc(0);
  try{await pipeline(r.response,new Transform({transform(chunk,_enc,cb){size+=chunk.length;header=Buffer.concat([header,chunk.subarray(0,Math.max(0,32-header.length))]);if(size>limit)return cb(Error('音频超过当前导入上限'));cb(null,chunk);}}),createWriteStream(file,{mode:0o600}));
    const audio=header.toString('ascii',0,3)==='ID3'||header[0]===255&&(header[1]&224)===224||header.toString('ascii',4,8)==='ftyp'||header.toString('ascii',0,4)==='OggS'||header.toString('ascii',0,4)==='RIFF'||header.toString('ascii',0,5)==='#!AMR';
    if(!audio)throw Error('下载内容不是可识别的音频，可能是登录页或访问提示');
    return {bytes:size,url:r.url};
  }catch(e){await rm(file,{force:true});throw e;}
}
