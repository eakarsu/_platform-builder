import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const builder=fileURLToPath(new URL('..',import.meta.url)),root=path.dirname(builder),plans=JSON.parse(await readFile(path.join(builder,'reports/build-manifest.json'))),results=[];
for(const [index,p] of plans.entries()){
 const dir=path.join(root,p.id),app=JSON.parse(await readFile(path.join(dir,'config/app.json'))),child=spawn('./start.sh',[],{cwd:dir,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);let exited=false;child.once('exit',()=>exited=true);
 try{
  let ready=false;for(let i=0;i<150;i++){if(exited)throw new Error(output.slice(-1200));try{const response=await fetch(`http://127.0.0.1:${app.port}/api/health`,{signal:AbortSignal.timeout(500)});const health=await response.json();if(health.service===p.id){ready=true;break;}}catch{}await delay(100);}
  if(!ready)throw new Error('Startup timeout '+output.slice(-800));
  const r={id:p.id,port:app.port,status:'passed',startScript:true,health:true,verifiedAt:new Date().toISOString()};results.push(r);await writeFile(path.join(dir,'reports/startup-verification.json'),JSON.stringify(r,null,2));console.log(`${index+1}/64 start.sh passed: ${p.id} :${app.port}`);
 }catch(e){results.push({id:p.id,status:'failed',error:e.message});console.log(`FAILED ${p.id}: ${e.message}`);}
 finally{child.kill('SIGTERM');for(let n=0;n<50&&!exited;n++)await delay(100);if(!exited)child.kill('SIGKILL');await writeFile(path.join(builder,'reports/startup-results.json'),JSON.stringify(results,null,2));}
}
if(results.some(r=>r.status==='failed'))process.exitCode=1;
