import {CloudAI} from './cloud-ai.mjs';
import {exportSyncBundle} from './migration.mjs';
import http from "node:http";
import { CodexBridge } from "./codex-bridge.mjs";
import { TranslationJobs } from "./translation-jobs.mjs";
import {PodcastJobs,podcastRoute} from './podcast-jobs.mjs';
import {captureImages} from './capture-images.mjs';
const podcasts=new PodcastJobs();
const codex = new CodexBridge();
const translations = new TranslationJobs({codex});
import { FeishuSync } from "./feishu-sync.mjs";
const feishu = new FeishuSync();
import {FeishuComments} from './feishu-comments.mjs';
const feishuComments=new FeishuComments(feishu);
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch {}
const root = resolve("dist");
const port = Number(process.env.PORT || 4318);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".png": "image/png",
  ".pdf": "application/pdf",
};
const server = http.createServer(async (req, res) => {
  const json = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (
      req.headers.host !== `127.0.0.1:${port}` &&
      req.headers.host !== `localhost:${port}`
    )
      return json(403, { error: "Host not allowed" });
    if(url.pathname==='/api/capture/images'){
      if(req.headers.origin&&![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return json(403,{error:'Origin not allowed'});
      if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON POST required'});let input='';for await(const chunk of req){input+=chunk;if(input.length>100000)return json(413,{error:'请求过大'});}return json(200,await captureImages(JSON.parse(input).urls));
    }
    if(url.pathname.startsWith('/api/podcasts/')){
      if(req.headers.origin&&![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return json(403,{error:'Origin not allowed'});
      let body={};if(req.method==='POST'){if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required'});let input='';for await(const chunk of req){input+=chunk;if(input.length>20000)return json(413,{error:'请求过大'});}body=JSON.parse(input||'{}');}
      return json(200,await podcastRoute(podcasts,url.pathname,req.method,body,url.searchParams));
    }
    if(url.pathname==='/api/migration/feishu'&&req.method==='GET'){
      if(req.headers.origin&&![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return json(403,{error:'Origin not allowed'});
      return json(200,await exportSyncBundle(feishu,feishuComments));
    }
    if (url.pathname.startsWith('/api/feishu/')) {
      if(req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return json(403,{error:'Origin not allowed'});
      if(url.pathname==='/api/feishu/status'&&req.method==='GET')return json(200,{...await feishu.status(),comments:await feishuComments.status()});
      if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON POST required'});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>320_000_000)return json(413,{error:'项目超过同步大小上限'});chunks.push(chunk);}
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(url.pathname==='/api/feishu/comments/configure')return json(200,await feishuComments.configure(payload.enabled));
      if(url.pathname==='/api/feishu/comments/next')return json(200,await feishuComments.next(payload.projectId));
      if(url.pathname==='/api/feishu/comments/complete')return json(200,await feishuComments.complete(payload));
      if(url.pathname==='/api/feishu/comments/fail')return json(200,await feishuComments.fail(payload.id,payload.message));
      if(url.pathname==='/api/feishu/comments/retry')return json(200,await feishuComments.retry(payload.id));
      if(url.pathname==='/api/feishu/comments/preference-disable')return json(200,await feishuComments.disablePreference(payload.id));
      if(url.pathname==='/api/feishu/configure')return json(200,await feishu.configure(payload.enabled));
      if(url.pathname==='/api/feishu/pull')return json(200,await feishu.pull(payload.projectId));
      if(url.pathname==='/api/feishu/ack'){const result=await feishu.acknowledge(payload.projectId,payload.token);await feishuComments.afterAck(payload.projectId,{keptLocal:payload.keptLocal===true});return json(200,result);}
      if(url.pathname==='/api/feishu/sync')return json(202,await feishu.enqueue(payload));
      return json(404,{error:'Not found'});
    }
    if (url.pathname.startsWith('/api/translation/')) {
      if(req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return json(403,{error:'Origin not allowed'});
      const parts=url.pathname.split('/').filter(Boolean);
      let payload={};
      if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required'});
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>85_000_000)return json(413,{error:'文件超过 60 MB'});chunks.push(chunk);}
        payload=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      }
      if(parts[2]==='convert'&&req.method==='POST')return json(200,await translations.convert(payload));
      if(parts[2]==='jobs'&&parts.length===3&&req.method==='POST')return json(202,await translations.create(payload));
      if(parts[2]==='jobs'&&parts[3]){
        const id=parts[3];
        if(parts.length===4&&req.method==='GET')return json(200,await translations.status(id));
        if(parts[4]==='result'&&req.method==='GET')return json(200,await translations.result(id));
        if(parts[4]==='retry'&&req.method==='POST')return json(202,await translations.retry(id));
        if(parts[4]==='cancel'&&req.method==='POST')return json(200,await translations.cancel(id));
      }
      return json(404,{error:'Translation route not found'});
    }
    if (url.pathname.startsWith("/api/codex/")) {
      if (req.headers.origin && !["http://localhost:"+port,"http://127.0.0.1:"+port].includes(req.headers.origin))
        return json(403,{error:"Origin not allowed"});
      if (url.pathname === "/api/codex/status" && req.method === "GET") return json(200,await codex.status());
      if (url.pathname !== "/api/codex/chat" || req.method !== "POST") return json(405,{error:"POST required"});
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:"JSON required"});
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>45_000_000)return json(413,{error:"上下文过大，请缩小选择范围"});chunks.push(chunk);}
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const controller=new AbortController();
      res.on('close',()=>{if(!res.writableEnded)controller.abort();});
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      const emit=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
      const heartbeat=setInterval(()=>emit({type:'heartbeat'}),10000);
      try {const result=await codex.answer(payload,{signal:controller.signal,emit});emit({type:'done',result});}
      catch(e){emit({type:'error',message:e.message});}
      finally{clearInterval(heartbeat);res.end();}
      return;
    }
    if (url.pathname === "/api/status")
      return json(200, {
        configured: !!process.env.FOLIO_AI_BASE_URL,
        model: process.env.FOLIO_AI_MODEL || "",
        local: true,
      });
    if (url.pathname === "/api/chat") {
      if (req.method !== "POST") return json(405, { error: "POST required" });
      if (
        req.headers.origin &&
        !["http://localhost:" + port, "http://127.0.0.1:" + port].includes(
          req.headers.origin,
        )
      )
        return json(403, { error: "Origin not allowed" });
      if (!process.env.FOLIO_AI_BASE_URL)
        return json(503, {
          error:
            "尚未连接 AI。请在 .env.local 配置 FOLIO_AI_BASE_URL、FOLIO_AI_MODEL 和可选密钥后重启。",
        });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 45_000_000)
          return json(413, { error: "上下文过大，请缩小选择范围" });
      }
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.messages))
        return json(400, { error: "messages required" });
      if(payload.literature){const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});return json(200,await new CloudAI({}).apiAnswer(payload,controller.signal));}
      const base = process.env.FOLIO_AI_BASE_URL.replace(/\/$/, "");
      const upstream = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.FOLIO_AI_API_KEY
            ? { Authorization: "Bearer " + process.env.FOLIO_AI_API_KEY }
            : {}),
        },
        body: JSON.stringify({
          model: payload.model || process.env.FOLIO_AI_MODEL,
          messages: payload.messages,
          stream: false,
        }),
        signal: AbortSignal.timeout(170000),
      });
      const data = await upstream.json();
      return json(upstream.status, data);
    }
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + sep)) return json(403, { error: "Forbidden" });
    const file = await stat(path);
    if (!file.isFile()) return json(404, { error: "Not found" });
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(path));
  } catch (e) {
    json(e.code === "ENOENT" ? 404 : 500, {
      error: e.code === "ENOENT" ? "Not found" : e.message,
    });
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Folio: http://127.0.0.1:${port}`);
  if (process.argv.includes("--open") && process.platform === "darwin")
    execFile("open", [`http://127.0.0.1:${port}`]);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { podcasts.stop();codex.stop(); server.close(); process.exit(0); });
