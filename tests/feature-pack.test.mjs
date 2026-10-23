import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {openStore} from '../template/hub/runtime/store.mjs';import {workspaceAPI} from '../template/hub/runtime/api.mjs';import {runInsight} from '../template/hub/runtime/insights.mjs';
const FEATURES=[
 {id:'clients',title:'Clients & customers',group:'Workspace',mode:'records',fields:[{name:'full_name',label:'Full name',type:'text'}]},
 {id:'matters',title:'Work items & projects',group:'Workspace',mode:'records',fields:[]},
 {id:'tasks',title:'Tasks',group:'Workspace',mode:'records',fields:[{name:'assignee',label:'Assignee',type:'text'},{name:'due_date',label:'Due date',type:'date'},{name:'priority',label:'Priority',type:'text'}]},
 {id:'applicants',title:'Applicants',group:'Lending',mode:'records',fields:[{name:'score',label:'Score',type:'number'},{name:'region',label:'Region',type:'text'}]}];
const PACK={insights:[{id:'insight-applicants',feature:'applicants',title:'Applicant pipeline insight',focus:'Summarize applicants.'},{id:'priority-actions',feature:'tasks',title:'Priority actions',focus:'Overdue work.'}]};
function clearKeys(){const saved={};for(const k of ['OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENAI_API_KEY','WORKSPACE_AUTH_TOKEN']){saved[k]=process.env[k];delete process.env[k];}return saved;}
function restore(saved){for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
async function serve(store,opts={}){const api=workspaceAPI(store,{features:FEATURES,featurePack:PACK,...opts});const server=http.createServer((req,res)=>api(req,res,new URL(req.url,`http://${req.headers.host}`)));await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,base:`http://127.0.0.1:${server.address().port}`};}
const H={'Content-Type':'application/json','X-Legal-Workspace':'1'};
test('tasks require auth token when configured; search, CSV and JSON export work',async()=>{
 const saved=clearKeys();process.env.WORKSPACE_AUTH_TOKEN='test-token';
 const store=openStore(':memory:',FEATURES);
 const {server,base}=await serve(store);
 try{
  assert.equal((await fetch(base+'/api/workspace/features/tasks/records')).status,401);
  assert.equal((await fetch(base+'/api/workspace/features/tasks/records',{headers:{Authorization:'Bearer test-token'}})).status,200);
  const created=await fetch(base+'/api/workspace/features/tasks/records',{method:'POST',headers:{...H,Authorization:'Bearer test-token'},body:JSON.stringify({title:'Review file',data:{assignee:'Ada',priority:'high'}})});
  assert.equal(created.status,201);const task=await created.json();
  const updated=await fetch(base+`/api/workspace/records/${task.id}`,{method:'PUT',headers:{...H,Authorization:'Bearer test-token'},body:JSON.stringify({...task,title:'Review file v2'})});
  assert.equal(updated.status,200);assert.equal((await updated.json()).title,'Review file v2');
  await fetch(base+'/api/workspace/features/applicants/records',{method:'POST',headers:{...H,Authorization:'Bearer test-token'},body:JSON.stringify({title:'Needle Applicant',data:{score:0,region:'north'}})});
  const found=await (await fetch(base+'/api/workspace/features/applicants/records?q=needle',{headers:{Authorization:'Bearer test-token'}})).json();
  assert.equal(found.length,1);assert.equal(found[0].data.score,0);
  const byData=await (await fetch(base+'/api/workspace/features/applicants/records?q=north',{headers:{Authorization:'Bearer test-token'}})).json();
  assert.equal(byData.length,1);
  const csv=await (await fetch(base+'/api/workspace/features/applicants/records/export',{headers:{Authorization:'Bearer test-token'}})).text();
  assert.match(csv,/Needle Applicant/);
  const jsonRes=await fetch(base+'/api/workspace/features/applicants/records/export?format=json',{headers:{Authorization:'Bearer test-token'}});
  assert.match(jsonRes.headers.get('content-type'),/application\/json/);
  const json=await jsonRes.json();assert.equal(json.count,1);assert.equal(json.records[0].data.score,0);
 }finally{await new Promise(r=>server.close(r));store.close();restore(saved);}
});
test('insights are deterministic fallback without a provider and preserve false/0 values',async()=>{
 const saved=clearKeys();
 const store=openStore(':memory:',FEATURES);
 const {server,base}=await serve(store);
 try{
  store.create('applicants',{title:'Solo Applicant',data:{score:0}});
  const catalog=await (await fetch(base+'/api/workspace/insights')).json();
  assert.deepEqual(catalog.map(d=>d.id),['insight-applicants','priority-actions']);
  const res=await fetch(base+'/api/workspace/insights/insight-applicants',{method:'POST',headers:H,body:'{}'});
  assert.equal(res.status,201);const body=await res.json();
  assert.equal(body.aiGenerated,false);assert.equal(body.fallback,true);assert.match(body.label,/Deterministic fallback/);
  assert.equal(body.data.total,1);assert.equal(body.data.hasRecords,true);
  assert.equal(JSON.stringify(body.sections).includes('"filled":0'),true);
  const brief=await runInsight(store,{kind:'record-brief',recordId:store.list('applicants')[0].id},undefined,FEATURES);
  assert.equal(brief.aiGenerated,false);assert.equal(brief.data.fields.find(f=>f.name==='score').value,0);
 }finally{await new Promise(r=>server.close(r));store.close();restore(saved);}
});
test('insights use the provider only when configured and label AI output',async()=>{
 const saved=clearKeys();
 const store=openStore(':memory:',FEATURES);
 const mock=async()=>({model:'test',choices:[{message:{content:'Narrative from supplied facts.'}}]});
 const {server,base}=await serve(store,{complete:mock});
 try{
  const res=await fetch(base+'/api/workspace/insights/priority-actions',{method:'POST',headers:H,body:'{}'});
  assert.equal(res.status,201);const body=await res.json();
  assert.equal(body.aiGenerated,true);assert.equal(body.fallback,false);assert.equal(body.data.hasOverdue,false);assert.equal(body.data.overdueCount,0);
 }finally{await new Promise(r=>server.close(r));store.close();restore(saved);}
});
