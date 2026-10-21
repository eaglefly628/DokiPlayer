import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadConfig(file) {
  const path = resolve(file);
  const c = JSON.parse(await readFile(path, 'utf8'));
  c.url = /^https?:/.test(c.url) ? c.url : pathToFileURL(resolve(dirname(path), c.url)).href;
  if (c.storageState) c.storageState = resolve(dirname(path), c.storageState);
  for (const key of ['maxSteps', 'timeoutMs', 'settleMs']) {
    if (!Number.isInteger(c[key]) || c[key] <= 0) throw Error(`配置 ${key} 必须是正整数`);
  }
  if (!['first', 'seeded', 'model'].includes(c.strategy?.type)) throw Error('不支持的选项策略');
  return c;
}
export function random(seed = 42) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; };
}
export function signature(s) {
  return JSON.stringify([s.url, s.story, s.choices.map(x => x.text), s.ending, s.phase]);
}
export function validateEvaluation(value, rubric, run) {
  if (!value || typeof value.summary !== 'string' || !Array.isArray(value.dimensions)) throw Error('评审格式错误');
  const ids = new Set(run.observations.map(x => x.id));
  if (value.dimensions.length !== rubric.dimensions.length) throw Error('评审维度数量不匹配');
  const results = rubric.dimensions.map(d => {
    const matches = value.dimensions.filter(x => x.id === d.id);
    if (matches.length !== 1) throw Error(`维度缺失或重复：${d.id}`);
    const r = matches[0];
    if (typeof r.reason !== 'string' || !Array.isArray(r.evidence) || r.evidence.some(id => !ids.has(id))) throw Error(`无效证据：${d.id}`);
    if (r.score !== null && (!Number.isFinite(r.score) || r.score < rubric.scale.min || r.score > rubric.scale.max || !r.evidence.length)) throw Error(`无效分数：${d.id}`);
    if (d.id === 'closure' && run.status !== 'completed' && r.score !== null) throw Error('未见结局不可评分收束');
    return { ...d, score: r.score, reason: r.reason, evidence: r.evidence };
  });
  const scored = results.filter(r => r.score !== null);
  const weight = scored.reduce((n, r) => n + r.weight, 0);
  const groups = Object.fromEntries(['story','framework'].map(scope => {
    const all=results.filter(d=>d.scope===scope), valid=all.filter(d=>d.score!==null);
    const w=valid.reduce((n,d)=>n+d.weight,0);
    return [scope,{score:w?Number((valid.reduce((n,d)=>n+d.score*d.weight,0)/w).toFixed(2)):null,scored:valid.length,total:all.length}];
  }));
  return { summary: value.summary, dimensions: results, groups, overall: null, scoredDimensions: scored.length, totalDimensions: results.length };
}
