// Rates are a frozen estimate, never an invoice. Unknown usage stays unknown.
export function normalizeUsage(u) {
  if (!u) return null;
  const input=u.prompt_tokens??u.input_tokens, output=u.completion_tokens??u.output_tokens;
  if (![input,output].every(n=>Number.isSafeInteger(n)&&n>=0)) return null;
  const cached=u.prompt_tokens_details?.cached_tokens??u.input_tokens_details?.cached_tokens??u.cached_input_tokens??u.prompt_cache_hit_tokens??0;
  const write=u.input_tokens_details?.cache_write_tokens??0;
  if (![cached,write].every(n=>Number.isSafeInteger(n)&&n>=0)||cached+write>input) return null;
  return {input,output,cached,cacheWrite:write,total:input+output,reasoning:u.completion_tokens_details?.reasoning_tokens??u.output_tokens_details?.reasoning_tokens??null};
}
export function estimateCost(usage, rates) {
  if (!usage||!rates) return null;
  const parts=[[usage.input-usage.cached-usage.cacheWrite,rates.input],[usage.cached,rates.cached],[usage.output,rates.output],[usage.cacheWrite,rates.cacheWrite]];
  if(parts.some(([n,p])=>n>0&&(!Number.isFinite(p)||p<0)))return null;
  return parts.reduce((sum,[n,p])=>sum+(n? n*p/1e6:0),0);
}
export function summarizeUsage(calls=[]) {
  const s={calls:calls.length,reported:0,missing:0,input:0,output:0,cached:0,total:0,apiEstimateUsd:0,subscriptionEquivalentUsd:0,unpriced:0,byRole:{}};
  for(const c of calls){
    const u=c.usage;
    if(u){s.reported++;for(const k of ['input','output','cached','total'])s[k]+=u[k];}else s.missing++;
    const cost=estimateCost(u,c.rates);
    if(cost===null)s.unpriced++;else if(c.mode==='subscription')s.subscriptionEquivalentUsd+=cost;else s.apiEstimateUsd+=cost;
    const r=s.byRole[c.role]??={calls:0,total:0};r.calls++;r.total+=u?.total??0;
  }
  return s;
}
