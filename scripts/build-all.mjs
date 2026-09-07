import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {build} from './build.mjs';import {verify} from './verify-app.mjs';
const builder=fileURLToPath(new URL('..',import.meta.url)),root=path.dirname(builder),plans=JSON.parse(await readFile(path.join(builder,'reports/build-manifest.json'))),results=process.env.PLATFORMS?JSON.parse(await readFile(path.join(builder,'reports/build-results.json'))).filter(r=>!process.env.PLATFORMS.split(',').includes(r.id)):[];
for(const [i,p] of plans.entries()){
 if(process.env.PLATFORMS&&!process.env.PLATFORMS.split(',').includes(p.id))continue;
 try{const dir=path.join(root,p.id),built=await build(dir),verified=await verify(dir);const seed=spawnSync(process.execPath,[path.join(dir,'dist/scripts/seed.mjs')],{cwd:dir,encoding:'utf8'});if(seed.status!==0)throw new Error(seed.stderr);const seeded=JSON.parse(seed.stdout.trim());results.push({id:p.id,built,verified,seeded,status:'passed'});console.log(`${i+1}/${plans.length} ${p.id}: ${built.features} pages; ${seeded.total} records; checks passed`);}
 catch(e){results.push({id:p.id,status:'failed',error:e.stack});console.log(`${i+1}/${plans.length} ${p.id}: FAILED ${e.message}`);}
 await writeFile(path.join(builder,'reports/build-results.json'),JSON.stringify(results,null,2)+'\n');
}
if(results.some(r=>r.status==='failed'))process.exitCode=1;
