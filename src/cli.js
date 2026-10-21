import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadConfig } from './core.js';
import { launch, play } from './runner.js';
import { evaluate } from './evaluator.js';

async function prompt(text) {
  if(!stdin.isTTY) throw Error('人工登录需要交互终端；请直接在终端运行该命令');
  const io=createInterface({input:stdin,output:stdout});
  try { return await io.question(text); } finally { io.close(); }
}
async function prepare({page,context},config,save=false) {
  console.log('\n浏览器已打开。请自行完成访问密码、账号登录和许可确认。');
  console.log('请选择测试存档并进入旅程；可停在开场漫画。存档满时请手动处理，程序不会自动删除。');
  console.log('遇到权限、付费、验证码，请在网页自行处理。密码不会写入项目。');
  if ((await prompt('准备好后在这里输入 start 开始；其他输入取消：')).trim()!=='start') throw Error('用户取消');
  if(new URL(page.url()).pathname.includes('gate')) throw Error('仍在访问密码页，请完成登录后重试');
  if(save) {
    if(!config.storageState) throw Error('未配置 storageState 保存路径');
    if((await prompt('是否将本次登录状态保存在本机 .auth 目录？输入 save 保存，其他输入跳过：')).trim()==='save') {
      await mkdir(dirname(config.storageState),{recursive:true});
      await context.storageState({path:config.storageState});
    }
  }
}

try {
  const [command,arg,...flags]=process.argv.slice(2);
  if(command==='evaluate') {
    if(!arg) throw Error('用法：npm run evaluate -- runs/<运行目录> [--visual]');
    const result=await evaluate(arg,'config/rubric.json',{visual:flags.includes('--visual')});
    console.log(`评测：${result.status}；报告已生成：${arg}/report.md`);
  } else if(command==='play' || command==='login') {
    if(!arg) throw Error(`用法：npm run ${command} -- config/aimeng.json`);
    const config=await loadConfig(arg);
    if(command==='login') {
      config.headless=false;
      const session=await launch(config);
      try {await prepare(session,config,true);} finally {await session.browser.close();}
    } else {
      if(config.manualPreparation) config.headless=false;
      const result=await play(config,{prepare:config.manualPreparation?s=>prepare(s,config):undefined});
      console.log(`游玩：${result.run.status}；记录：${result.directory}`);
      await evaluate(result.directory);
      if(['failed','stalled'].includes(result.run.status)) process.exitCode=1;
    }
  } else console.log('DokiPlayer\n npm run demo\n npm run play -- config/aimeng.json\n npm run login -- config/aimeng.json\n npm run evaluate -- runs/<运行目录> [--visual]');
} catch(e) {console.error(`操作未完成：${e.message}`);process.exitCode=1;}
