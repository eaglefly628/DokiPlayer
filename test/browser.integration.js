import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/core.js';
import { play } from '../src/runner.js';
test('示例经过真实点击到达结局，保存截图与轨迹',async()=>{
 const config=await loadConfig('config/demo.json');
 const outputRoot=await mkdtemp(join(tmpdir(),'dokiplayer-test-'));
 const {run,directory}=await play(config,{outputRoot});
 assert.equal(run.status,'completed',JSON.stringify(run.errors));
 assert.equal(run.actions.length,2);assert.equal(run.observations.length,3);
 for(const o of run.observations) assert.ok((await readFile(join(directory,o.screenshot))).length>100);
 assert.ok((await readFile(join(directory,'trace.zip'))).length>100);
});
test('步骤上限不能当成通关',async()=>{
 const config=await loadConfig('config/demo.json');config.maxSteps=1;
 const outputRoot=await mkdtemp(join(tmpdir(),'dokiplayer-limit-'));
 const {run}=await play(config,{outputRoot});assert.equal(run.status,'step_limit');assert.equal(run.actions.length,1);
});
