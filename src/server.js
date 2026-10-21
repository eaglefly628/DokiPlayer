import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './core.js';
import { play } from './runner.js';
import { evaluate } from './evaluator.js';

const root=resolve('web/dist'), jobs=new Map();
const port=Number(process.env.PORT||4317);
const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.headers.host!==`127.0.0.1:${port}` && req.headers.host!==`localhost:${port}`) return send(403,{error:'仅限本地访问'});
    if(req.method==='POST') {
      if(req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)) return send(403,{error:'来源不匹配'});
      const chunks=[];let length=0;
      for await(const chunk of req) {length+=chunk.length;if(length>10000) return send(413,{error:'请求过大'});chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
      if(url.pathname==='/api/jobs') {
        if([...jobs.values()].some(j=>!['done','failed','cancelled'].includes(j.phase))) return send(409,{error:'请先完成或停止当前任务'});
        if(!['demo','aimeng'].includes(body.config)) return send(400,{error:'未知配置'});
        const config=await loadConfig(`config/${body.config}.json`);
        if(body.strategy==='model') config.strategy={type:'model'};
        const id=randomUUID(),job={id,name:config.name,phase:'starting',run:null,directory:null,createdAt:new Date().toISOString()};jobs.set(id,job);
        send(202,{id});
        void (async()=>{
          try {
            const result=await play(config,{
              onSession:session=>{job.session=session;if(job.cancelled)void session.browser.close();},
              onProgress:({run,directory})=>{job.run=run;job.directory=directory;if(job.phase!=='awaiting_user')job.phase='playing';},
              prepare:config.manualPreparation?async session=>{
                job.session=session;job.phase='awaiting_user';
                await new Promise((yes,no)=>{job.resume=yes;job.reject=no;});
                if(job.cancelled) throw Error('用户停止');
                job.phase='playing';
              }:undefined
            });
            job.directory=result.directory;job.run=result.run;
            job.phase='evaluating';job.evaluation=await evaluate(result.directory);job.phase=result.run.status==='failed'?'failed':'done';
          } catch(e) {job.phase='failed';job.error=e.message;}
          finally {if(job.cancelled)job.phase='cancelled';job.session=null;job.resume=null;job.reject=null;}
        })(); return;
      }
      const match=url.pathname.match(/^\/api\/jobs\/([^/]+)\/(ready|stop|evaluate)$/);
      if(match) {
        const job=jobs.get(match[1]);if(!job)return send(404,{error:'任务不存在'});
        if(match[2]==='ready') {
          if(job.phase!=='awaiting_user') return send(409,{error:'当前不在准备阶段'});
          if(body.saveSession) {
            await mkdir('.auth',{recursive:true});
            await job.session.context.storageState({path:resolve('.auth/aimeng.json')});
          }
          job.resume();return send(200,{ok:true});
        }
        if(match[2]==='evaluate') {
          if(!['done','failed'].includes(job.phase))return send(409,{error:'请先等待游玩结束'});
          job.evaluation=await evaluate(job.directory,'config/rubric.json',{visual:body.visual===true});return send(200,job.evaluation);
        }
        job.cancelled=true;job.reject?.(Error('用户停止'));await job.session?.browser.close();job.phase='cancelled';return send(200,{ok:true});
      }
      return send(404,{error:'入口不存在'});
    }
    if(url.pathname==='/api/status')return send(200,{local:true,player:!!process.env.PLAYER_MODEL,judge:!!process.env.JUDGE_MODEL});
    if(url.pathname==='/api/jobs')return send(200,[...jobs.values()].map(({session,resume,reject,...data})=>({...data,directory:data.directory?basename(data.directory):null})));
    if(url.pathname.startsWith('/api/evidence/')) {
      const [, , ,id,file]=url.pathname.split('/');const job=jobs.get(id);
      if(!job?.directory || !/^step-\d+\.png$/.test(file))return send(404,{error:'证据不存在'});
      const bytes=await readFile(resolve(job.directory,file));res.writeHead(200,{'Content-Type':'image/png'});res.end(bytes);return;
    }
    const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+'/'))return send(403,{error:'路径无效'});
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json; charset=utf-8'})[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);
  } catch(e) {send(e.code==='ENOENT'?404:500,{error:e.code==='ENOENT'?'尚无此数据':e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`DokiPlayer 工作台 http://127.0.0.1:${port}`));
