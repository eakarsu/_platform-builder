import path from 'node:path';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ROOT,features} from './workspace.mjs';
import {openStore} from '../hub/runtime/store.mjs';
const names=['Alex Morgan','Jordan Ellis','Taylor Brooks','Casey Rivera','Morgan Lee','Jamie Parker','Riley Bennett','Cameron Reed','Avery Hayes','Quinn Foster','Drew Sullivan','Harper Collins','Skyler Evans','Reese Carter','Rowan Mitchell'];
export function sampleValue(field,i){
 if(field.type==='reference')return '';
 if(field.type==='select')return field.options[i%field.options.length];
 if(field.type==='date')return `2026-09-${String(10+i%15).padStart(2,'0')}`;
 if(field.type==='email'||/email/i.test(field.name))return `sample${i+1}@example.com`;
 if(field.type==='number')return /percent|rate|hours|age|count|number/i.test(field.name)?5+i:100+i*25;
 if(/phone/i.test(field.name))return `202-555-${String(100+i).padStart(4,'0')}`;
 if(/url|website/i.test(field.name))return 'https://example.com/sample';
 if(/name|assignee|owner|recipient/i.test(field.name))return names[i%15];
 if(field.type==='textarea')return `Fictional example ${i+1}. Gather source evidence, review assumptions and record the next action. This is demonstration data, not a real transaction or provider response.`;
 if(/currency/i.test(field.name))return 'USD';
 return `${field.label} sample ${i+1}`;
}
export function seedWorkspace(store,registry=features){
 const writable=registry.filter(f=>!['report','audit'].includes(f.mode)),order=[...writable.filter(f=>f.id==='clients'),...writable.filter(f=>f.id==='matters'),...writable.filter(f=>!['clients','matters'].includes(f.id))];
 let created=0,drafts=0;const fresh=[];
 store.transaction(()=>{
 for(const f of order){const rows=store.list(f.id),clients=store.list('clients'),matters=store.list('matters');for(let i=rows.length;i<15;i++){
  const parent=matters[i%Math.max(1,matters.length)],data=Object.fromEntries(f.fields.filter(x=>x.type!=='reference').map(field=>[field.name,sampleValue(field,i)]));
  const r=store.create(f.id,{title:`[Sample] ${f.title} · ${names[i]}`,status:f.mode==='integration'?'draft':['draft','active','review'][i%3],practice_area:f.group,client_id:f.id==='clients'?null:(parent?.client_id||clients[i%Math.max(1,clients.length)]?.id),matter_id:['clients','matters'].includes(f.id)?null:parent?.id,data,notes:'Fictional demonstration record. No real customer information or external operation is represented.'});created++;fresh.push(r);
  if(f.ai&&i===0){store.addDraft(r.id,{model:'sample-data',content:'SAMPLE REVIEW NOTE — NOT AI-GENERATED\n\nConfirm supplied facts, obtain missing evidence and assign a reviewer. This example demonstrates stored draft history without contacting a provider.'});drafts++;}
  if(f.id==='documents'&&i===0)store.addAttachment(r.id,{name:'sample-document.txt',type:'text/plain',base64:Buffer.from('Fictional sample document. No real customer information.').toString('base64')});
 }}
 for(const r of fresh){const f=store.feature(r.feature),data={...r.data};let changed=false;for(const field of f.fields.filter(x=>x.type==='reference')){const parents=store.list(field.reference);if(parents.length){data[field.name]=(parents.find(x=>x.client_id===r.client_id)||parents[0]).id;changed=true;}}if(changed)store.update(r.id,{...r,data});}
 });
 const counts=Object.fromEntries(writable.map(f=>[f.id,store.list(f.id).length]));return {created,drafts,editableTables:writable.length,minimumRows:Math.min(...Object.values(counts)),total:Object.values(counts).reduce((a,b)=>a+b,0),counts};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile(path.join(ROOT,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const store=openStore(process.env.WORKSPACE_DB||path.join(ROOT,'data/workspace.sqlite'),features);
 try{const report=seedWorkspace(store);writeFileSync(path.join(ROOT,'reports/seed-verification.json'),JSON.stringify({...report,verifiedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({...report,counts:undefined}));}finally{store.close();}
}
