import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';
import {plans,rows,present,root,builder} from './inspect-ai-env.mjs';
const realRows=rows.filter(r=>!/^\.env\.test/.test(path.basename(r.file)));
const majority=values=>{const counts=new Map();for(const v of values.filter(present))counts.set(v,(counts.get(v)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];};
const sharedKeys=new Set(realRows.map(r=>r.env.OPENROUTER_API_KEY).filter(present));
if(sharedKeys.size!==1)throw new Error('Expected one consistent source provider key; no files were changed.');
const sharedKey=[...sharedKeys][0],defaultModel=majority(realRows.map(r=>r.env.OPENROUTER_MODEL));if(!defaultModel)throw new Error('No source model setting found.');
const results=[];
for(const p of plans){
 const dir=path.join(root,p.id),file=path.join(dir,'.env'),exists=fs.existsSync(file),original=exists?fs.readFileSync(file,'utf8'):'',existing=parseEnv(original),app=JSON.parse(fs.readFileSync(path.join(dir,'config/app.json'),'utf8'));
 const sourceNames=new Set(p.sources),candidates=realRows.filter(r=>sourceNames.has(path.relative(root,r.file).split(path.sep)[0]));
 const model=present(existing.OPENROUTER_MODEL)?existing.OPENROUTER_MODEL:majority(candidates.map(r=>r.env.OPENROUTER_MODEL))||defaultModel;
 const key=present(existing.OPENROUTER_API_KEY)?existing.OPENROUTER_API_KEY:majority(candidates.map(r=>r.env.OPENROUTER_API_KEY))||sharedKey;
 const desired={OPENROUTER_API_KEY:key,OPENROUTER_MODEL:model};if(!present(existing.PORT)&&!present(existing.HUB_PORT))desired.PORT=String(app.port);
 let text=original||'# Local merged workspace settings. Keep this file private and out of version control.\n';const updated=[];
 for(const [name,value] of Object.entries(desired)){
  if(present(existing[name]))continue;
  // Drop only missing/placeholder assignments for a setting we are filling; preserve all other user configuration.
  const assignment=new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=');text=text.split('\n').filter(line=>!assignment.test(line)).join('\n');
  if(!text.endsWith('\n'))text+='\n';text+=name+'='+JSON.stringify(value)+'\n';updated.push(name);
 }
 const parsed=parseEnv(text);if(parsed.OPENROUTER_API_KEY!==key||parsed.OPENROUTER_MODEL!==model)throw new Error('Environment serialization failed for '+p.id);
 const temp=file+'.merge-'+process.pid;try{fs.writeFileSync(temp,text,{mode:0o600,flag:'wx'});fs.renameSync(temp,file);fs.chmodSync(file,0o600);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 const ignored=fs.readFileSync(path.join(dir,'.gitignore'),'utf8').split(/\r?\n/).includes('.env');if(!ignored)throw new Error('Missing .env ignore rule for '+p.id);
 results.push({id:p.id,status:'configured',created:!exists,updatedSettings:updated,model,port:Number(parsed.PORT||parsed.HUB_PORT||app.port),sourceEnvFiles:candidates.length,modelSelection:present(existing.OPENROUTER_MODEL)?'preserved existing':candidates.some(r=>present(r.env.OPENROUTER_MODEL))?'most common among assigned source apps':'shared portfolio default',credentialSelection:present(existing.OPENROUTER_API_KEY)?'preserved existing':'consistent source credential',permissions:'0600',gitIgnored:true});
}
fs.writeFileSync(path.join(builder,'reports/env-merge-results.json'),JSON.stringify({completedAt:new Date().toISOString(),apps:results.length,policy:'Preserve existing nonempty settings; merge common runtime AI settings; select source-group majority model; retain assigned ports.',results},null,2)+'\n');
console.log(JSON.stringify({configured:results.length,created:results.filter(r=>r.created).length,sourceGroupModels:results.filter(r=>r.modelSelection==='most common among assigned source apps').length,sharedFallbackModels:results.filter(r=>r.modelSelection==='shared portfolio default').length,privateFiles:results.every(r=>r.permissions==='0600'),ignored:results.every(r=>r.gitIgnored)}));
