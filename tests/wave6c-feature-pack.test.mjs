import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';
import {openStore} from '../template/hub/runtime/store.mjs';
import {workspaceAPI} from '../template/hub/runtime/api.mjs';
import {insightCatalog,buildInsight} from '../template/hub/runtime/insights.mjs';

const features=[
 {id:'clients',title:'Clients',group:'Workspace',mode:'records',fields:[]},
 {id:'matters',title:'Work items',group:'Workspace',mode:'records',fields:[]},
 {id:'tasks',title:'Tasks',group:'Workspace',mode:'records',fields:[{name:'assignee',label:'Assignee',type:'text'},{name:'due_date',label:'Due date',type:'date'},{name:'priority',label:'Priority',type:'text'}]},
 {id:'billing',title:'Invoices & billing',group:'Finance',mode:'records',fields:[{name:'amount',label:'Amount',type:'number'}]}];
const pack=[{id:'insight-billing',feature:'billing',title:'Invoice & billing insight',focus:'Summarize billing.'},{id:'priority-actions',feature:'tasks',title:'Priority actions',focus:'Overdue tasks.'}];
function clearKeys(){for(const k of ['OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENAI_API_KEY'])delete process.env[k];}

test('Wave 6C: every target app ships a valid 3-insight feature pack',async()=>{
 for(const app of ['accounting-platform','agriculture-platform','ai-data-platform','auto-platform','aviation-platform']){
  const cfg=JSON.parse(await readFile(new URL(`../../${app}/config/feature-pack.json`,import.meta.url),'utf8'));
  const feats=JSON.parse(await readFile(new URL(`../../${app}/config/merged-features.json`,import.meta.url),'utf8'));
  const catalog=insightCatalog(feats,{id:app},cfg.insights);
  assert.equal(catalog.length,3,app);assert.ok(catalog.some(d=>d.id==='priority-actions'),app);
 }
});

test('Wave 6C: insight fallback is deterministic (aiGenerated:false) without keys and preserves 0/false',async()=>{
 clearKeys();const store=openStore(':memory:',features);try{
  let calls=0;const complete=async()=>{calls++;throw new Error('must not be called');};
  const r=await buildInsight(store,features,{id:'accounting-platform'},'insight-billing',undefined,{},pack);
  assert.equal(calls,0);assert.equal(r.aiGenerated,false);assert.match(r.label,/Deterministic fallback/);
  const total=r.sections.find(s=>s.label==='Total records');assert.equal(total.value,0);
  const has=r.sections.find(s=>s.label==='Has records');assert.equal(has.value,false);
 }finally{store.close();}
});

test('Wave 6C: insight uses provider only when a key is configured',async()=>{
 clearKeys();process.env.OPENROUTER_API_KEY='test-only-not-real';const store=openStore(':memory:',features);try{
  store.create('billing',{title:'Invoice A',data:{amount:0}});
  const r=await buildInsight(store,features,{id:'accounting-platform'},'insight-billing',async()=>({model:'mock',choices:[{message:{content:'One billing record needs review.'}}]}),{},pack);
  assert.equal(r.aiGenerated,true);assert.equal(r.sections[0].label,'Narrative');assert.equal(r.data.total,1);
 }finally{store.close();clearKeys();}
});

test('Wave 6C: authenticated tasks CRUD, search/filter, CSV+JSON export and insight route over HTTP',async()=>{
 clearKeys();const store=openStore(':memory:',features);
 const api=workspaceAPI(store,{features,app:{id:'accounting-platform'},featurePack:{insights:pack}});
 const server=http.createServer((req,res)=>api(req,res,new URL(req.url,`http://${req.headers.host}`)));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const H={'Content-Type':'application/json','X-Legal-Workspace':'1'};
 try{
  // mutation without workspace header is rejected
  assert.equal((await fetch(base+'/api/workspace/features/tasks/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'No auth'})})).status,403);
  const created=await (await fetch(base+'/api/workspace/features/tasks/records',{method:'POST',headers:H,body:JSON.stringify({title:'Wave6C task',status:'review',data:{assignee:'Sam',priority:'high'}})})).json();
  assert.ok(created.id);
  const updated=await (await fetch(base+`/api/workspace/records/${created.id}`,{method:'PUT',headers:H,body:JSON.stringify({...created,title:'Wave6C task updated',status:'active'})})).json();
  assert.equal(updated.title,'Wave6C task updated');assert.equal(updated.revision,created.revision+1);
  const filtered=await (await fetch(base+'/api/workspace/features/tasks/records?q=Wave6C&status=active')).json();
  assert.equal(filtered.length,1);assert.equal(filtered[0].id,created.id);
  assert.equal((await (await fetch(base+'/api/workspace/features/tasks/records?q=nomatch')).json()).length,0);
  const csv=await (await fetch(base+'/api/workspace/features/tasks/records/export')).text();assert.match(csv,/Wave6C task updated/);
  const jsonRes=await fetch(base+'/api/workspace/features/tasks/records/export?format=json');assert.match(jsonRes.headers.get('content-type'),/application\/json/);
  const json=await jsonRes.json();assert.equal(json.count,1);assert.equal(json.records[0].title,'Wave6C task updated');
  const insightRes=await fetch(base+'/api/workspace/insights/insight-billing',{method:'POST',headers:H,body:'{}'});
  assert.equal(insightRes.status,201);const insight=await insightRes.json();assert.equal(insight.aiGenerated,false);assert.ok(Array.isArray(insight.sections));
 }finally{await new Promise(r=>server.close(r));store.close();}
});
