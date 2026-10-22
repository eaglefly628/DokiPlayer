import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {normalizeUsage,summarizeUsage} from '../web/dist/api-usage.js';
const pricing=JSON.parse(await readFile(new URL('../config/pricing.json',import.meta.url),'utf8'));
export function recordUsage(run,{body,role,model,mode='api',rates,url,status='received',images=0}){
  const resolvedModel=body?.model||model;
  const rateSnapshot=rates??(mode==='subscription'||/^https:\/\/api\.openai\.com\//.test(url||process.env[role.toUpperCase()+'_URL']||'')?pricing.models[resolvedModel]:null);
  (run.apiCalls??=[]).push({at:new Date().toISOString(),role,mode,model:resolvedModel,responseId:body?.id??null,status,images,usage:normalizeUsage(body?.usage),rates:rateSnapshot??null,pricingCheckedAt:pricing.checkedAt,pricingSource:rates?'custom':pricing.source});
  run.usageSummary=summarizeUsage(run.apiCalls);
}
export async function saveUsage(directory,run){
  await writeFile(resolve(directory,'usage.json'),JSON.stringify({calls:run.apiCalls||[],summary:summarizeUsage(run.apiCalls),scope:'仅计本执行器调用；不含游戏内AI、Codex桌面会话及基础设施费用'},null,2));
}
