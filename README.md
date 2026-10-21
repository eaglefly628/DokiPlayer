# DokiPlayer

理解与评测 DokiWorlds 框架及其中多个故事的工作台。当前是可运行的首版工程：本地浏览器执行器、网页任务面板、可复用游玩知识库、独立玩家决策与评审接口。

线上私有工作台：https://dokiplayer-lab-junbai.tinyrice9.chatgpt.site （使用所有者的 ChatGPT 账号登录）。

## 快速开始

需要 Node.js 22.9+。

```sh
npm install
npx playwright install chromium
npm start
```

打开 http://127.0.0.1:4317 。点击“开始一次游玩”可运行本地示例；选择 DokiWorlds 后，在新打开的独立浏览器中自行完成密码、登录和存档准备，再回工作台点击“已准备好”。登录状态可选择保存到本机 `.auth/`；该目录不会提交。现有内嵌浏览器的登录状态不会自动复制到独立浏览器。

## 当前能力与边界

- 已通读游戏内7项卡牌教程；知识区分引导说明、实玩验证、用户经验和待验证假设。
- 已适配鬼故事序章、章节入口和开局行动卡；真实网站结局标识、地图移动、自由输入与其他故事尚待适配。没有结局标识时只报告步骤上限或超时。
- 首次准备由用户选测试存档。程序不自动删除存档、不自动接受用户许可。
- 可复现选择用于验证采集流程，不代表理解游戏。AI玩家模式读取知识库与观察历史，依据目标选择当前行动卡，并保存简短理由和预期结果。
- 输出 `runs/<时间-id>/run.json`、截图、`trace.zip`、`evaluation.json`、`report.md`。登录阶段不录制，运行材料可能包含游戏内账号信息，默认只在本地。
- 评分维度是草案，故事与框架分开。未接模型不生成分数，无图不评画面，未见结局不评收束。单路线评分不能代表全部故事。
- 云端 Sites 版提供知识库、流程和浏览器内的记录导入。云端不能直接启动本地 Playwright；自动游玩和评审任务在本地工作台运行。
- 本地任务列表当前保存在服务进程内；重启后运行文件仍在，可导入 `run.json` 查看文字记录。云端导入只在当前浏览器内解析，不持久保存。

## 接入玩家与评审模型

复制 `.env.example` 为 `.env`，填入完整 Chat Completions 兼容接口、模型名和密钥。玩家用 `PLAYER_*`，评审用 `JUDGE_*`。密钥不写入网页或配置。

网页选择“AI玩家”启用模型决策；已完成任务可重新评审文字或文字加截图。调用会将本次材料发送到所配置服务。视觉评审需支持图片输入的模型。

```sh
npm run demo
npm run play -- config/aimeng.json
npm run login -- config/aimeng.json
node --env-file=.env src/cli.js evaluate runs/<运行目录> --visual
npm test
npm run test:browser
node src/build-web.js
```

`npm start` 自动加载 `.env`；CLI 单独调用时使用 `node --env-file=.env`。知识修改后运行 `node src/build-web.js` 同步网页数据，再按 Sites 工作流发布 `web/`。

Sites 使用独立发布检出目录（本次位于工作区 `work/dokiplayer-site`），把 `web/` 内容同步过去再发布；不要在本 GitHub 仓库的 `web/` 内初始化嵌套 Git 仓库。保留 `web/.openai/hosting.json` 中的同一项目 ID。

## 持续学习

先读 [测试手册](docs/如何测试DokiWorlds故事.md)、[框架知识](knowledge/framework.json)、[教程原文](knowledge/sources/tutorial-2026-10-21.json) 和 [鬼故事知识](knowledge/ghost-story.json)。后续从更多故事、实际操作与反例积累，修订适用范围；不把一局的结果推广为框架通则。

## 工程结构

`src/` 包含浏览器采集、玩家、评审、命令行和本地服务。`config/` 配置页面适配与评分草案。`knowledge/` 保存知识与来源。`docs/` 保存测试流程。`web/` 是独立 Sites 发布目录，仅包含网页和选定知识数据，不包含登录状态、密钥或运行记录。

浏览器实现参考 [Playwright Page API](https://playwright.dev/docs/api/class-page) 与 [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext)。
