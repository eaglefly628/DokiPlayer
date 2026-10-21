import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { observe, act } from './browser.js';
import { random, signature } from './core.js';
import { decide } from './player.js';

export async function launch(config) {
  const browser = await chromium.launch({headless:config.headless});
  let state;
  if (config.storageState) try { await access(config.storageState); state=config.storageState; } catch {}
  try {
    const context = await browser.newContext({ storageState:state, viewport:{width:1440,height:1000} });
    context.setDefaultTimeout(config.timeoutMs);
    const page = await context.newPage();
    await page.goto(config.url,{waitUntil:'domcontentloaded',timeout:config.timeoutMs});
    return { browser, context, page };
  } catch(e) { await browser.close(); throw e; }
}

export async function play(config, {prepare, outputRoot='runs', onProgress=()=>{}, onSession=()=>{}} = {}) {
  const directory=resolve(outputRoot, `${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`);
  await mkdir(directory,{recursive:true});
  const run={schemaVersion:1, name:config.name, startedAt:new Date().toISOString(), status:'running', strategy:config.strategy, observations:[], actions:[], errors:[]};
  onProgress({run,directory});
  let session;
  try {
    session=await launch(config);
    onSession(session);
    const {page,context}=session;
    // Authentication occurs before capture, so credentials never enter trace/screenshots.
    if (prepare) await prepare(session);
    if (!config.selectors.story || !config.selectors.choices) throw Error('请先配置已验证的剧情和行动选择器');
    await context.tracing.start({screenshots:true,snapshots:true});
    page.on('pageerror', e => run.errors.push({type:'page',message:e.message}));
    const rng=random(config.strategy.seed);
    let previous=null, changedAt=Date.now(), deadline=Date.now()+config.timeoutMs;
    for (let n=0;n<=config.maxSteps;) {
      const s=await observe(page,config);
      const sig=signature(s);
      if(sig!==previous) { previous=sig; changedAt=Date.now(); }
      const stable=!s.loading && Date.now()-changedAt>=config.settleMs;
      if(!stable || (!s.story && !s.ending) || (!s.ending && !s.advance && !s.choices.length)) {
        if(Date.now()>deadline) {run.status='stalled';break;}
        await page.waitForTimeout(200); continue;
      }
      const id=`step-${run.observations.length+1}`;
      const screenshot=`${id}.png`;
      await page.screenshot({path:resolve(directory,screenshot),fullPage:true});
      run.observations.push({...s,id,screenshot,at:new Date().toISOString()});
      onProgress({run,directory});
      if(s.ending) {run.status='completed';break;}
      if(n===config.maxSteps) {run.status='step_limit';break;}
      const choice=s.choices[config.strategy.type==='first'?0:Math.floor(rng()*s.choices.length)];
      const action=s.advance || (config.strategy.type==='model' ? await decide(run,config) : {type:'choice',...choice, reason:'流程验证策略，不代表玩家逻辑判断',expected:'页面或行动反馈发生变化'});
      run.actions.push({observation:id,...action});
      onProgress({run,directory});
      await act(page,config,action);
      n++;
      // A successful click is not proof of progression; require a new state.
      deadline=Date.now()+config.timeoutMs;
      while(signature(await observe(page,config))===sig) {
        if(Date.now()>deadline) {run.status='stalled';break;}
        await page.waitForTimeout(200);
      }
      if(run.status==='stalled') break;
      previous=null; changedAt=Date.now();
    }
  } catch(e) {run.status='failed';run.errors.push({type:'runner',message:e.message});}
  finally {
    if(session) {
      await session.context.tracing.stop({path:resolve(directory,'trace.zip')}).catch(()=>{});
      await session.browser.close();
    }
    run.finishedAt=new Date().toISOString();
    await writeFile(resolve(directory,'run.json'),JSON.stringify(run,null,2));
    onProgress({run,directory});
  }
  return {run,directory};
}
