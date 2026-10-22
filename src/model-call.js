import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modelConfig} from './model-settings.js';
import {recordUsage,saveUsage} from './usage.js';
export async function callModel({role,run,directory,messages,config}){
 const c=config??await modelConfig(role);if(!c.model)throw Error('请先在模型设置中配置玩家和评审');
 let body,status='failed';const images=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(x=>x.type==='image_url');
 try{
  if(c.mode==='subscription')body=await subscriptionCall(messages,c.model,images);
  else{
   if(!c.url||!c.key)throw Error('请先配置 API 接口和密钥');
   const response=await fetch(c.url,{method:'POST',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${c.key}`},body:JSON.stringify({model:c.model,response_format:{type:'json_object'},messages})});
   body=await response.json();if(!response.ok)throw Error(`模型接口 HTTP ${response.status}`);
  }
  status='received';return {body,model:body.model||c.model};
 }finally{recordUsage(run,{body,role,model:c.model,mode:c.mode,rates:c.rates,url:c.url,status,images:images.length});if(directory)await saveUsage(directory,run);}
}
export async function codexStatus(){return new Promise(resolve=>{
 const child=spawn(process.env.DOKIPLAYER_CODEX_BIN||'codex',['login','status'],{stdio:['ignore','pipe','pipe']});let out='';
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
 child.on('error',()=>resolve({available:false,subscription:false,message:'未找到 Codex CLI，请在本机安装后授权'}));
 child.on('close',code=>resolve({available:true,subscription:code===0&&/chatgpt/i.test(out),message:code===0&&/chatgpt/i.test(out)?'已通过 ChatGPT 登录':'尚未确认订阅授权，请在本机终端执行 codex login'}));
 setTimeout(()=>child.kill(),10000).unref();
 });}
async function subscriptionCall(messages,model,images){
 const status=await codexStatus();if(!status.subscription)throw Error(status.message);
 const temp=await mkdtemp(join(tmpdir(),'dokiplayer-model-'));
 try{
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--model',model,'--cd',temp];
  for(let i=0;i<images.length;i++){
   const match=/^data:image\/png;base64,(.*)$/.exec(images[i].image_url.url);if(!match)throw Error('订阅模式只接受本轮采集的 PNG 截图');
   const path=join(temp,`${i}.png`);await writeFile(path,Buffer.from(match[1],'base64'));args.push('--image',path);
  }
  args.push('-');const prompt='仅分析给定游戏材料并输出要求的JSON。不要调用工具、读取其他文件或执行命令。\n'+messages.map(m=>`${m.role}: ${typeof m.content==='string'?m.content:m.content.filter(x=>x.type==='text').map(x=>x.text).join('\n')}`).join('\n');
  return await new Promise((resolve,reject)=>{
   const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET)/i.test(k)));
   const child=spawn(process.env.DOKIPLAYER_CODEX_BIN||'codex',args,{env,stdio:['pipe','pipe','pipe']});let output='',tooLarge=false;
   const timer=setTimeout(()=>child.kill(),180000);
   child.stdout.on('data',d=>{output+=d;if(output.length>8e6){tooLarge=true;child.kill();}});child.stderr.resume();child.stdin.on('error',()=>{});
   child.on('error',e=>{clearTimeout(timer);reject(e);});
   child.on('close',code=>{clearTimeout(timer);if(code!==0||tooLarge)return reject(Error('本地 Codex 调用未完成，请检查授权或额度'));
    let usage=null,text='';for(const line of output.split('\n')){try{const e=JSON.parse(line);if(e.type==='turn.completed')usage=e.usage;if(e.type==='item.completed'&&e.item?.type==='agent_message')text=e.item.text;}catch{}}
    resolve({model,usage,choices:[{message:{content:text}}]});
   });child.stdin.end(prompt);
  });
 }finally{await rm(temp,{recursive:true,force:true});}
}
