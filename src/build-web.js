import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('web/dist/data',{recursive:true});
for(const [source,dest] of [['knowledge/framework.json','framework'],['knowledge/sources/tutorial-2026-10-21.json','tutorial'],['knowledge/ghost-story.json','story']]) await copyFile(source,`web/dist/data/${dest}.json`);
console.log('知识库已同步到网页');
