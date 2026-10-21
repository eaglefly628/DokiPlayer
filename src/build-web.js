import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('web/dist/data',{recursive:true});
for(const [source,dest] of [['knowledge/framework.json','framework'],['knowledge/sources/tutorial-2026-10-21.json','tutorial'],['knowledge/ghost-story.json','story']]) await copyFile(source,`web/dist/data/${dest}.json`);
await copyFile('knowledge/playbook.json','web/dist/data/playbook.json');
await copyFile('config/rubric.json','web/dist/data/rubric.json');
console.log('知识库已同步到网页');

for (const [source,dest] of [["knowledge/barovia.json","barovia.json"],["reports/barovia-ui-findings.json","barovia-bugs.json"],["reports/barovia-stage-review.md","barovia-review.md"],["docs/如何测试DokiWorlds故事.md","playbook.md"]]) await copyFile(source,`web/dist/data/${dest}`);
