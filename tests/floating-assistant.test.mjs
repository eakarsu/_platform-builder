import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openStore} from '../template/hub/runtime/store.mjs';
import {workspaceAPI} from '../template/hub/runtime/api.mjs';
const features=[{id:'notes',title:'AI Notes',path:'/features/notes',description:'Draft notes',ai:true,group:'Work',mode:'records',fields:[]},{id:'finance',title:'AI Finance',path:'/features/finance',ai:true,group:'Work',mode:'records',fields:[]},{id:'clients',title:'Customers',path:'/features/clients',ai:false,group:'Work',mode:'records',fields:[]}];
test('Floating chat validates page and item context, preserves follow-ups, and isolates its saved history',async()=>{
 const store=openStore(':memory:',features),calls=[];
 const selected=store.create('clients',{title:'Chosen customer',notes:'Explicitly supplied facts',data:{}}),other=store.create('clients',{title:'Unselected confidential customer',data:{}});
 const legacy=store.addAnswer('notes',{question:'Legacy question',answer:'Legacy answer',model:'test',context:{}});
 const api=workspaceAPI(store,{features,app:{productName:'Test app'},complete:async body=>{calls.push(body);return {model:'test',choices:[{message:{content:'## Answer\nSelected facts only.'}}]};}});
 const server=http.createServer(async(req,res)=>{if(!await api(req,res,new URL(req.url,'http://'+req.headers.host))){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=body=>fetch(base+'/api/workspace/assistant/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Legal-Workspace':'1'},body:JSON.stringify(body)});
 try{
  let r=await post({question:'Explain this page',pagePath:'/features/clients'});assert.equal(r.status,201);const first=await r.json();assert.equal(first.context.selectedRecord,null);assert.equal(first.context.page.title,'Customers');assert.equal(first.context.source,'floating');assert.equal(first.context.page.path,'/features/clients');assert.doesNotMatch(JSON.stringify(calls),/Chosen customer|Unselected confidential customer/);
  r=await post({question:'Explain this customer',pagePath:'/features/clients',recordId:selected.id,previousAnswerId:first.id});assert.equal(r.status,201);const second=await r.json();assert.equal(second.context.selectedRecord.id,selected.id);assert.equal(second.previous_id,first.id);assert.match(JSON.stringify(calls[1]),/Selected facts only/);assert.doesNotMatch(JSON.stringify(calls),/Unselected confidential customer/);
  assert.equal((await post({question:'Where am I?',pagePath:'/not-in-this-app'})).status,404);
  assert.equal((await post({question:'Bad capability',capabilityIds:['clients']})).status,400);
  assert.equal((await post({question:'Wrong record',recordId:'not-a-record'})).status,404);
  assert.equal((await post({question:'Wrong history',previousAnswerId:legacy.id})).status,404);
  assert.equal(calls.length,2);
  const list=await (await fetch(base+'/api/workspace/assistant/answers')).json();assert.deepEqual(new Set(list.map(r=>r.id)),new Set([first.id,second.id]));assert.equal((await fetch(base+'/api/workspace/assistant/answers/'+legacy.id)).status,404);
  const featureAsk=await fetch(base+'/api/workspace/features/finance/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Legal-Workspace':'1'},body:JSON.stringify({question:'Cannot broaden scoped assistant',recordId:other.id})});assert.equal(featureAsk.status,429); // Shared rate limit applies to both routes.
 }finally{await new Promise(r=>server.close(r));store.close();}
});
