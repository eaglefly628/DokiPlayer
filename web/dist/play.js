import {summarizeUsage} from './api-usage.js';
import {elapsedMs,endSession,resumeSession,formatElapsed} from './session-clock.js';
const $=s=>document.querySelector(s), escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [manual,rubric]=await Promise.all(['playbook','rubric'].map(f=>fetch(`/data/${f}.json`).then(r=>r.json())));
const stories=await fetch('/data/stories.json').then(r=>r.json());
const requestedStory=new URLSearchParams(location.search).get('story')||'barovia';
const storyId=Object.hasOwn(stories,requestedStory)?requestedStory:'barovia',target=stories[storyId];
const key=storyId==='barovia'?'dokiplayer-barovia-workflow-v2':`dokiplayer-${storyId}-workflow-v1`;
document.title=`DokiPlayer · ${target.name}体验`;
$('.play-header>strong').textContent=`${target.name} · 新游戏评测`;$('.process h1').textContent=`${target.name} · 评测流程`;$('.game-toolbar>span').textContent=`游戏界面 · ${new URL(target.url).host}`;
for(const a of document.querySelectorAll('a[href="/data/barovia-bugs.json"],a[href="/data/barovia-review.md"]'))a.hidden=storyId!=='barovia';
if(storyId!=='barovia'){manual.steps.find(s=>s.id==='new-game').instruction='在当前故事菜单选择新游戏或新旅程，核对实际文案；不要继续旧档。';manual.steps.find(s=>s.id==='prologue').instruction='阅读当前故事的序章与引导，先找明确继续按钮；旧故事的点击规则在本故事中须重新验证。';}
let session;
try{session=JSON.parse(localStorage.getItem(key)||'null');}catch{}
const newRequested=new URLSearchParams(location.search).has('newSession');
if(session&&(newRequested)){const archive=JSON.parse(localStorage.getItem('dokiplayer-session-archive')||'[]');archive.push(session);localStorage.setItem('dokiplayer-session-archive',JSON.stringify(archive));session=null;}
if(newRequested)history.replaceState(null,'',location.pathname+(storyId==='barovia'?'':`?story=${storyId}`));
if(!session)session={id:crypto.randomUUID(),name:target.name,targetUrl:target.url,storyId,mode:'fresh_game_required',source:'workbench',manualVersion:manual.manualVersion,engineVersion:null,engineBuild:null,scriptVersion:null,createdAt:new Date().toISOString(),gameStartedAt:null,completedSteps:0,events:[],newGameVerified:false};
function persist(){localStorage.setItem(key,JSON.stringify(session));$('#script-version-display').textContent=session.scriptVersion||'待核验';$('#engine-version-display').textContent=session.engineVersion||'待核验';$('#save-state').textContent=session.endedAt?'本轮已结束 · 记录已保存':'已保存到当前浏览器';}
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,5000);}
function versions(){for(const [id,k]of [['engine-version','engineVersion'],['engine-build','engineBuild'],['script-version','scriptVersion']])session[k]=$(id[0]==='#'?id:`#${id}`).value.trim()||null;}
for(const [id,k]of [['engine-version','engineVersion'],['engine-build','engineBuild'],['script-version','scriptVersion']]){$(`#${id}`).value=session[k]||'';$(`#${id}`).onchange=()=>{versions();persist();};}
$('#manual-version').textContent=`v${session.manualVersion}`;
$('#version-baseline').textContent=storyId!=='barovia'?'开发站及新故事的引擎、构建号、剧本版本均须现场核验；不沿用测试站基线。':`手册已观察兼容基线：引擎 ${manual.compatibility.engineVersion} / ${manual.compatibility.engineBuild}，本故事 ${manual.compatibility.stories.find(s=>s.id===storyId)?.scriptVersion||'未确认（新故事）'}。请核验本次实际版本，不能直接沿用。`;
$('#rubric-list').innerHTML=rubric.dimensions.map(d=>`<p><strong>${escape(d.name)}</strong> · 0–100<br>${escape(d.description)}</p>`).join('');
function render(){const index=Math.min(session.completedSteps,manual.steps.length-1),step=manual.steps[index];$('#workflow').innerHTML=manual.steps.map((s,i)=>`<li class="${i<session.completedSteps?'done':i===index?'current':''}">${escape(s.title)}</li>`).join('');$('#current-step-label').textContent=`步骤 ${index+1}/${manual.steps.length}`;$('#current-step-title').textContent=step.title;$('#current-instruction').textContent=step.instruction;$('#event-count').textContent=session.events.length;$('#new-game-confirm').checked=session.newGameVerified;$('#event-list').innerHTML=session.events.slice().reverse().map(e=>`<article class="event-entry"><strong>${escape(e.kind)} · ${escape(e.stage)}</strong><p>${escape(e.action)}</p><p>实际：${escape(e.result)}</p><small>${escape(new Date(e.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))}</small></article>`).join('')||'<p>尚无操作记录。</p>';}
function record(kind,advance=false){versions();const step=manual.steps[Math.min(session.completedSteps,manual.steps.length-1)];const action=$('#action-note').value.trim(),result=$('#result-note').value.trim();if(!action||!result)return notify('请填写实际操作与页面反馈，不能空记录。');if(advance&&step.id==='baseline'&&!$('#new-game-confirm').checked)return notify('正式评测须先核验新游戏起点。');session.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),stage:step.title,kind,action,result,manualVersion:session.manualVersion,engineVersion:session.engineVersion,engineBuild:session.engineBuild,scriptVersion:session.scriptVersion});if(step.id==='baseline'&&advance){session.newGameVerified=true;session.gameStartedAt=new Date().toISOString();}if(advance){session.completedSteps=Math.min(manual.steps.length,session.completedSteps+1);if(step.id==='review')endSession(session);}$('#action-note').value='';$('#result-note').value='';persist();render();renderClock();notify(session.endedAt?'本轮已结束，会话用时已停止':kind==='卡点'?'卡点已记录，流程保持当前阶段':'本步已记录');}
$('#restart-session').onclick=()=>{location.href=location.pathname+`?story=${storyId}&newSession=1`;};
$('#complete-step').onclick=()=>record('流程确认',true);$('#record-only').onclick=()=>record('操作记录');$('#record-blocker').onclick=()=>record('卡点');
$('#connect-game').onclick=()=>{const frame=$('#game-frame');if(!frame.src){frame.src=target.url;frame.hidden=false;$('#game-placeholder').hidden=true;session.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),stage:'工作台入口',kind:'入口操作',action:`在工作台下方载入${target.name}入口`,result:'已发起载入；页面能否显示与登录状态需现场核验',manualVersion:session.manualVersion});persist();render();}$('#connect-game').textContent='已发起载入';};
function renderUsage(){const s=summarizeUsage(session.apiCalls);$('#usage-summary').textContent=!s.calls?'未采集 API 用量，不能推算本轮实际费用。':`已导入 ${s.calls} 次调用 · 已知 ${s.total.toLocaleString()} Token（输入 ${s.input}，其中缓存 ${s.cached}；输出 ${s.output}） · 缺失 ${s.missing} 次 · 已知 API 预估 $${s.apiEstimateUsd.toFixed(6)} · 订阅 API 等价参考 $${s.subscriptionEquivalentUsd.toFixed(6)} · 未计价 ${s.unpriced} 次。费用不是账单，不含游戏内 AI 与基础设施。`;session.usageSummary=s;}
$('#usage-import').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());const calls=data.calls||data.apiCalls;if(!Array.isArray(calls)||calls.some(c=>!['player','judge'].includes(c.role)||!['api','subscription'].includes(c.mode)||c.usage&&!['input','output','cached','total'].every(k=>Number.isFinite(c.usage[k])&&c.usage[k]>=0)))throw Error();session.apiCalls=calls;renderUsage();persist();notify('已替换本轮用量导入，重复导入不会重复累计');}catch{notify('用量文件格式无效，请导入执行器生成的 usage.json');}e.target.value='';};
function renderClock(){
 $('#session-time').textContent=formatElapsed(elapsedMs(session));
 $('#timer-state').textContent=session.endedAt?'已结束':'计时中';
 $('#toggle-session').textContent=session.endedAt?'继续计时':'结束本轮评测';
}
$('#toggle-session').onclick=()=>{
 const ended=!!session.endedAt;
 if(ended)resumeSession(session);else endSession(session);
 session.events.push({id:crypto.randomUUID(),at:new Date().toISOString(),stage:'会话计时',kind:ended?'继续计时':'结束评测',action:ended?'继续同一轮评测的计时':'结束本轮评测并停止计时',result:ended?'结束期间未计入会话用时':'计时已冻结，记录和游戏进度保留；这不代表游戏通关',manualVersion:session.manualVersion});
 persist();render();renderClock();notify(ended?'已继续计时，结束期间不计入用时':'本轮已结束，会话用时已停止');
};
$('#show-instructions').onclick=()=>$('#embed-help').hidden=!$('#embed-help').hidden;
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$('#download-session').onclick=()=>{versions();persist();download(`DokiPlayer-${session.id}.json`,JSON.stringify({...session,elapsedMs:elapsedMs(session),exportedAt:new Date().toISOString()},null,2),'application/json');};
$('#download-markdown').onclick=()=>{versions();const lines=[`# ${session.name} · 工作台流程记录`,'',`引擎：${session.engineVersion||'未确认'} / ${session.engineBuild||'未确认'}`,`剧本：${session.scriptVersion||'未确认'}`,`手册：${session.manualVersion}`,`新游戏起点已核验：${session.newGameVerified?'是':'否'}`,`会话开始：${session.createdAt}`,`会话状态：${session.endedAt?'已结束':'计时中'}`,`会话结束：${session.endedAt||'尚未结束'}`,`会话用时：${formatElapsed(elapsedMs(session))}`,`Token 与费用：${$('#usage-summary').textContent}`,`导出：${new Date().toISOString()}`,'','会话用时包含准备、讨论与等待，不等于纯游玩时长。','',...session.events.flatMap(e=>[`## ${e.stage} · ${e.kind}`,e.at,'',e.action,'',`实际反馈：${e.result}`,''])];download(`DokiPlayer-${session.id}.md`,lines.join('\n'),'text/markdown');};
renderUsage();setInterval(renderClock,1000);render();renderClock();persist();
