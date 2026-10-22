import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeUsage,estimateCost,summarizeUsage} from '../web/dist/api-usage.js';
import {validateSettings,publicSettings} from '../src/model-settings.js';
import {callModel} from '../src/model-call.js';
import {recordUsage,saveUsage} from '../src/usage.js';
const rates={input:2,cached:0.1,output:10};
test('缓存与推理不能重复计费，兼容 Chat Completions、Responses、Codex usage',()=>{
 const u=normalizeUsage({prompt_tokens:1000000,completion_tokens:100000,prompt_tokens_details:{cached_tokens:400000},completion_tokens_details:{reasoning_tokens:50000}});
 assert.equal(u.total,1100000);assert.equal(estimateCost(u,rates),2.24);
 assert.deepEqual(normalizeUsage({input_tokens:1000000,output_tokens:100000,input_tokens_details:{cached_tokens:400000},output_tokens_details:{reasoning_tokens:50000}}),u);
 assert.equal(normalizeUsage({input_tokens:100,output_tokens:2,cached_input_tokens:50}).cached,50);
 assert.equal(normalizeUsage(undefined),null);assert.equal(normalizeUsage({input_tokens:3}),null);
 assert.equal(normalizeUsage({input_tokens:3,output_tokens:2,input_tokens_details:{cached_tokens:4}}),null);
 assert.equal(estimateCost({...u,cacheWrite:10},rates),null);
});
test('API 与订阅参考值分开，缺失用量和未知单价不得伪造零费用',()=>{
 const usage=normalizeUsage({input_tokens:1000000,output_tokens:100000});
 const s=summarizeUsage([{role:'player',mode:'api',usage,rates},{role:'judge',mode:'subscription',usage,rates},{role:'judge',usage:null},{role:'judge',usage}]);
 assert.equal(s.total,3300000);assert.equal(s.missing,1);assert.equal(s.unpriced,2);
 assert.equal(s.apiEstimateUsd,3);assert.equal(s.subscriptionEquivalentUsd,3);
 assert.equal(s.byRole.judge.calls,3);
});
test('供应商不同不得套用 OpenAI 价格，调用失败与重评追加并持久保存',async()=>{
 const run={};recordUsage(run,{role:'player',model:'gpt-6.1-sol',url:'https://other.example/v1/chat/completions',body:{usage:{prompt_tokens:1000,completion_tokens:10}}});
 recordUsage(run,{role:'judge',model:'gpt-6.1-sol',mode:'subscription',body:{usage:{input_tokens:1000,output_tokens:10}}});
 recordUsage(run,{role:'judge',model:'unknown',status:'failed'});
 assert.equal(run.apiCalls[0].rates,null);assert.equal(run.usageSummary.calls,3);assert.equal(run.usageSummary.unpriced,2);
 const dir=await mkdtemp(join(tmpdir(),'dokiplayer-usage-'));try{await saveUsage(dir,run);assert.equal(JSON.parse(await readFile(join(dir,'usage.json'),'utf8')).calls.length,3);}finally{await rm(dir,{recursive:true});}
});
test('设置不回显密钥，换接口不能沿用旧密钥，无需密钥的订阅模式独立保存',()=>{
 const s=validateSettings({player:{mode:'api',model:'test',url:'https://api.example/v1/chat/completions',key:'fake-test-key',rates}});
 assert.equal(publicSettings(s).player.key,undefined);assert.equal(publicSettings(s).player.hasKey,true);
 assert.equal(validateSettings({player:{...s.player,key:''}},s).player.key,'fake-test-key');
 assert.throws(()=>validateSettings({player:{...s.player,url:'https://another.example',key:''}},s));
 assert.throws(()=>validateSettings({player:{...s.player,url:'http://api.example'}}));
 assert.throws(()=>validateSettings({player:{...s.player,rates:{input:-1}}}));
 assert.equal(validateSettings({player:{mode:'subscription',model:'gpt-6.1-sol'}}).player.key,undefined);
});

test('接口成功与无 usage 的失败调用均落盘，模型内容无效也不会丢失用量',async()=>{
 const previous=globalThis.fetch,dir=await mkdtemp(join(tmpdir(),'dokiplayer-call-')),run={};
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({model:'test-model',usage:{prompt_tokens:2000,completion_tokens:100},choices:[{message:{content:'invalid json'}}]}),{status:200});
  const result=await callModel({role:'player',run,directory:dir,config:{mode:'api',model:'test-model',url:'https://example.test/chat',key:'not-a-real-key',rates},messages:[]});
  assert.throws(()=>JSON.parse(result.body.choices[0].message.content));
  globalThis.fetch=async()=>new Response('{}',{status:429});
  await assert.rejects(callModel({role:'judge',run,directory:dir,config:{mode:'api',model:'test-model',url:'https://example.test/chat',key:'not-a-real-key'},messages:[]}),/429/);
  const saved=JSON.parse(await readFile(join(dir,'usage.json'),'utf8'));
  assert.equal(saved.calls.length,2);assert.equal(saved.summary.total,2100);assert.equal(saved.summary.missing,1);assert.equal(saved.calls[1].status,'failed');
  assert.equal(JSON.stringify(saved).includes('not-a-real-key'),false);
 }finally{globalThis.fetch=previous;await rm(dir,{recursive:true});}
});

test('本地订阅通过 CLI JSON 事件累计用量，不调用 API（模拟官方进程）',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dokiplayer-codex-')),prior=process.env.DOKIPLAYER_CODEX_BIN;
 try{
  const bin=join(dir,'fake-codex');await writeFile(bin,`#!/usr/bin/env node
if(process.argv.includes('login')){console.log('Logged in using ChatGPT');}else{process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{\"connected\":true}'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1000,cached_input_tokens:500,output_tokens:100}}));});}
`,{mode:0o700});
  process.env.DOKIPLAYER_CODEX_BIN=bin;const run={};
  const {body}=await callModel({role:'judge',run,directory:dir,config:{mode:'subscription',model:'gpt-6.1-sol'},messages:[{role:'user',content:'JSON test fixture'}]});
  assert.equal(JSON.parse(body.choices[0].message.content).connected,true);assert.equal(run.usageSummary.cached,500);
  assert.equal(run.usageSummary.apiEstimateUsd,0);assert.ok(run.usageSummary.subscriptionEquivalentUsd>0);
 }finally{if(prior)process.env.DOKIPLAYER_CODEX_BIN=prior;else delete process.env.DOKIPLAYER_CODEX_BIN;await rm(dir,{recursive:true});}
});
