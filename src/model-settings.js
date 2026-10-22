import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const file=resolve('.auth/model-settings.json');
export async function loadModelSettings(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
export function validateSettings(value,previous={}){
 const result={};
 for(const role of ['player','judge']){
  const p=value[role];if(!p)continue;
  if(!['api','subscription'].includes(p.mode)||typeof p.model!=='string'||!p.model.trim())throw Error('请选择接入方式并填写模型名称');
  const r={mode:p.mode,model:p.model.trim(),provider:String(p.provider||'custom'),rates:null};
  if(p.mode==='api'){
   const url=new URL(p.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('API 接口必须为不带凭证的 HTTPS 地址');
   r.url=url.href;r.key=p.key?.trim()||((previous[role]?.url===r.url)?previous[role]?.key:'');if(!r.key)throw Error('请填写 API 密钥');
  }
  if(p.rates){for(const k of ['input','cached','output'])if(!Number.isFinite(p.rates[k])||p.rates[k]<0)throw Error('单价必须为非负数字');r.rates=Object.fromEntries(['input','cached','output'].map(k=>[k,p.rates[k]]));}
  result[role]=r;
 }
 return result;
}
export async function saveModelSettings(value){const next=validateSettings(value,await loadModelSettings());await mkdir(resolve('.auth'),{recursive:true,mode:0o700});await writeFile(file,JSON.stringify(next,null,2),{mode:0o600});return publicSettings(next);}
export function publicSettings(s){return Object.fromEntries(Object.entries(s).map(([k,{key,...v}])=>[k,{...v,hasKey:!!key}]));}
export async function modelConfig(role){const s=(await loadModelSettings())[role];if(s)return s;const prefix=role.toUpperCase();return {mode:'api',url:process.env[prefix+'_URL'],key:process.env[prefix+'_API_KEY'],model:process.env[prefix+'_MODEL']};}
