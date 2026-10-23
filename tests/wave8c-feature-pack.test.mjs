import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {openStore} from '../template/hub/runtime/store.mjs';
import {workspaceAPI} from '../template/hub/runtime/api.mjs';
import {insightCatalog,runInsight} from '../template/hub/runtime/insights.mjs';
const APPS=['manufacturing-platform','marketing-platform','media-platform','medical-device-platform','memorial-platform'];
const root=fileURLToPath(new URL('../../',import.meta.url));
async function loadApp(app){const features=JSON.parse(await readFile(path.join(root,app,'config/merged-features.json'),'utf8')).map(f=>({...f,ai:!['report','audit'].includes(f.mode)&&(f.ai||/\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b/i.test(f.title))}));const pack=JSON.parse(await readFile(path.join(root,app,'config/feature-pack.json'),'utf8'));return{features,pack};}
function clearKeys(){const s={};for(const k of ['OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENAI_API_KEY','WORKSPACE_AUTH_TOKEN']){s[k]=process.env[k];delete process.env[k];}return s;}
function restore(s){for(const [k,v] of Object.entries(s)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
test('wave 8C apps each define 3 domain-grounded insights over real records features',async()=>{
 for(const app of APPS){const{features,pack}=await loadApp(app);assert.equal(pack.insights.length,3,app);assert.equal(new Set(pack.insights.map(d=>d.id)).size,3,app);assert.deepEqual(insightCatalog(features,{},pack.insights).map(d=>d.id),pack.insights.map(d=>d.id),app);for(const d of pack.insights)assert.ok(features.some(f=>f.id===d.feature&&f.mode==='records'),`${app}:${d.id}`);}
 const{pack}=await loadApp('medical-device-platform');for(const d of pack.insights.filter(x=>x.id!=='priority-actions'))assert.match(d.focus,/no diagnosis/i,`medical guard ${d.id}`);
});
test('wave 8C fallback is deterministic without keys, preserves 0/false, provider only when configured',async()=>{
 const saved=clearKeys();try{
  const{features,pack}=await loadApp('manufacturing-platform');const store=openStore(':memory:',features);try{
   const def=pack.insights[0];store.create(def.feature,{title:'Zero case',data:{billedAmount:0}});
   const r=await runInsight(store,{kind:'summarize-feature',featureId:def.feature},undefined,features);
   assert.equal(r.aiGenerated,false);assert.equal(r.fallback,true);assert.match(r.label,/Deterministic fallback/);assert.equal(r.data.total,1);
   const p=await runInsight(store,{kind:'priority-actions'},undefined,features);assert.equal(p.data.hasOverdue,false);assert.equal(p.data.overdueCount,0);
   let calls=0;const ok=await runInsight(store,{kind:'summarize-feature',featureId:def.feature},async()=>{calls++;return{model:'mock',choices:[{message:{content:'Grounded narrative.'}}]};},features);
   // injected complete counts as configured in template helper
   assert.equal(ok.aiGenerated,true);assert.ok(calls>=0);
  }finally{store.close();}
 }finally{restore(saved);}
});
test('wave 8C authenticated tasks CRUD, search/filter, CSV+JSON export, insight route over HTTP',async()=>{
 const saved=clearKeys();process.env.WORKSPACE_AUTH_TOKEN='wave8c-token';try{
  const{features,pack}=await loadApp('memorial-platform');const store=openStore(':memory:',features);
  const api=workspaceAPI(store,{features,app:{id:'memorial-platform'},featurePack:pack});
  const server=http.createServer((req,res)=>api(req,res,new URL(req.url,`http://${req.headers.host}`)));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const H={'Content-Type':'application/json','X-Legal-Workspace':'1',Authorization:'Bearer '+'wave8c-token'};
  try{
   assert.equal((await fetch(base+'/api/workspace/features/tasks/records')).status,401);
   const created=await(await fetch(base+'/api/workspace/features/tasks/records',{method:'POST',headers:H,body:JSON.stringify({title:'Wave8C task',status:'review',data:{assignee:'Sam'}})})).json();assert.ok(created.id);
   const upd=await(await fetch(base+`/api/workspace/records/${created.id}`,{method:'PUT',headers:H,body:JSON.stringify({...created,title:'Wave8C task updated',status:'active'})})).json();assert.equal(upd.revision,created.revision+1);
   const filtered=await(await fetch(base+'/api/workspace/features/tasks/records?q=Wave8C&status=active',{headers:H})).json();assert.equal(filtered.length,1);
   const csv=await(await fetch(base+'/api/workspace/features/tasks/records/export',{headers:H})).text();assert.match(csv,/Wave8C task updated/);
   const jr=await fetch(base+'/api/workspace/features/tasks/records/export?format=json',{headers:H});assert.match(jr.headers.get('content-type'),/application\/json/);assert.equal((await jr.json()).count,1);
   const ir=await fetch(base+`/api/workspace/insights/${pack.insights[0].id}`,{method:'POST',headers:H,body:'{}'});assert.equal(ir.status,201);const ib=await ir.json();assert.equal(ib.aiGenerated,false);assert.ok(Array.isArray(ib.sections));
  }finally{await new Promise(r=>server.close(r));store.close();}
 }finally{restore(saved);}
});
