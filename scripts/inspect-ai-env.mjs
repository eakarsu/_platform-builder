import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';
const root='/Volumes/external/projects',builder=path.join(root,'_platform-builder');
const plans=JSON.parse(fs.readFileSync(path.join(builder,'reports/build-manifest.json'),'utf8'));
const skip=new Set(['node_modules','.git','dist','build','.next','.venv','venv','coverage','.build','data','vendor','.cache']);
const files=[];function walk(dir,depth=0){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const e of list){if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isFile()&&/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(e.name))files.push(p);else if(e.isDirectory()&&depth<3&&!skip.has(e.name)&&!e.name.startsWith('.'))walk(p,depth+1);}}
const unique=new Set(plans.flatMap(p=>p.sources));for(const name of unique)walk(path.join(root,name));
const present=v=>typeof v==='string'&&v.trim()&&!/^(?:your[-_ ]|replace|example|placeholder|changeme|test[-_ ]|sk-or-v1-(?:test|example|placeholder))/i.test(v)&&!v.includes('${');
const rows=[];let parseErrors=0;for(const file of files){try{const env=parseEnv(fs.readFileSync(file,'utf8'));const selected=Object.fromEntries(Object.entries(env).filter(([k,v])=>/OPENROUTER|OPENAI|AI_MODEL|LLM_MODEL/.test(k)&&present(v)));if(Object.keys(selected).length)rows.push({file,env:selected});}catch{parseErrors++;}}
const names={};for(const r of rows)for(const k of Object.keys(r.env))names[k]=(names[k]||0)+1;
const keys=new Set(rows.map(r=>r.env.OPENROUTER_API_KEY).filter(present)),models={};for(const r of rows){const m=r.env.OPENROUTER_MODEL;if(present(m))models[m]=(models[m]||0)+1;}
console.log(JSON.stringify({sourceApps:unique.size,envFiles:files.length,filesWithAISettings:rows.length,parseErrors,variableCounts:names,distinctOpenRouterKeys:keys.size,explicitOpenRouterModels:models},null,2));
// Values stay in this process. This module does not write credentials or inventories of their values.
export {plans,rows,present,root,builder};
