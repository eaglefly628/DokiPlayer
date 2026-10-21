import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedMs,endSession,resumeSession,formatElapsed} from '../web/dist/session-clock.js';
test('旧会话结束后计时冻结，刷新后仍保持',()=>{
 const s={createdAt:'2026-10-21T00:00:00Z'};
 const at=Date.parse(s.createdAt)+65000;
 assert.equal(endSession(s,at),true);
 assert.equal(endSession(s,at+50000),false);
 assert.equal(formatElapsed(elapsedMs(JSON.parse(JSON.stringify(s)),at+86400000)),'01:05');
});
test('继续计时排除结束期间，反复结束不会重复累计',()=>{
 const s={createdAt:'2026-10-21T00:00:00Z'},start=Date.parse(s.createdAt);
 endSession(s,start+60000);resumeSession(s,start+3600000);
 assert.equal(resumeSession(s,start+3601000),false);
 endSession(s,start+3630000);
 assert.equal(elapsedMs(s,start+7200000),90000);
 resumeSession(s,start+7200000);endSession(s,start+7210000);
 assert.equal(elapsedMs(s,start+9999999),100000);
});
