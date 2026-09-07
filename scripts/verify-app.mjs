import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function verify(root){
 const load=rel=>import(pathToFileURL(path.join(root,'dist',rel)));const {features,appConfig}=await load('scripts/workspace.mjs'),{openStore}=await load('hub/runtime/store.mjs'),{seedWorkspace}=await load('scripts/seed.mjs'),{createHub}=await load('hub/server.mjs');
 const temp=await mkdtemp(path.join(os.tmpdir(),'platform-verify-')),databasePath=path.join(temp,'db.sqlite');let store=openStore(databasePath,features);let server;let calculators=0;
 try{
  const seed=seedWorkspace(store);assert.equal(seed.minimumRows,15);assert.equal(seed.created,features.filter(f=>!['audit','report'].includes(f.mode)).length*15);
  const preserved=store.list('clients')[0];assert.equal(seedWorkspace(store).created,0);assert.deepEqual(store.get(preserved.id),preserved);store.close();store=null;
  server=createHub({databasePath,complete:async()=>({model:'test',choices:[{message:{content:'Mocked review draft from supplied inputs.'}}]})});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const base=`http://127.0.0.1:${server.address().port}`;
  const request=(url,method='GET',body)=>fetch(base+url,{method,headers:{'Content-Type':'application/json','X-Legal-Workspace':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  for(const f of features){assert.equal((await request(f.path)).status,200,f.id);if(['report','audit'].includes(f.mode))continue;const rows=await (await request(`/api/workspace/features/${f.id}/records`)).json();assert.equal(rows.length,15,f.id);
   for(const spec of f.calculations||[]){const response=await request(`/api/workspace/records/${rows[0].id}/calculate`,'POST',{calculationId:spec.id});const result=await response.json();assert.ok([201,422].includes(response.status),f.id+': '+JSON.stringify(result));if(response.status===201){assert.ok(result.result);calculators++;}}
  }
  let response=await request('/api/workspace/features/clients/records','POST',{title:'Test shared client',data:{full_name:'Test Owner'}});assert.equal(response.status,201);const c=await response.json();
  response=await request('/api/workspace/features/matters/records','POST',{title:'Test shared work',client_id:c.id,data:{}});assert.equal(response.status,201);const m=await response.json();
  response=await request('/api/workspace/features/notes/records','POST',{title:'Test evidence',client_id:c.id,matter_id:m.id,data:{content:'Input facts'},notes:'Original note'});assert.equal(response.status,201);const n=await response.json();
  response=await request(`/api/workspace/records/${n.id}`,'PUT',{...n,title:'Updated evidence'});assert.equal(response.status,200);assert.equal((await response.json()).revision,n.revision+1);
  assert.equal((await request(`/api/workspace/records/${n.id}`,'PUT',{...n,title:'Stale edit'})).status,409);
  assert.equal((await request(`/api/workspace/records/${c.id}`,'DELETE',{})).status,409);
  const ai=features.find(f=>f.ai&&!f.fields.some(x=>x.required));if(ai){const row=(await (await request(`/api/workspace/features/${ai.id}/records`)).json())[0];assert.equal((await request(`/api/workspace/records/${row.id}/ai`,'POST',{instructions:'Review supplied facts.'})).status,201);}
  const attack=await fetch(base+`/api/workspace/records/${n.id}`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Legal-Workspace':'1',Origin:'https://example.com'},body:'{}'});assert.equal(attack.status,403);
  response=await request(`/api/workspace/records/${n.id}/attachments`,'POST',{name:'sample.txt',type:'text/plain',base64:Buffer.from('Evidence file').toString('base64')});assert.equal(response.status,201);
  assert.match(await (await request('/api/workspace/features/notes/records/export')).text(),/Updated evidence/);
  for(const url of ['/.env','/config/app.json','/data/workspace.sqlite','/features/not-existing'])assert.equal((await request(url)).status,404);
  const report={id:appConfig.id,status:'passed',features:features.length,editableTables:seed.editableTables,minimumRows:15,repeatSeedCreated:0,crud:true,persistence:true,relationships:true,revisions:true,attachments:true,exports:true,mockedAI:true,originProtection:true,sourceCalculationsExecuted:calculators,verifiedAt:new Date().toISOString()};await writeFile(path.join(root,'reports/verification.json'),JSON.stringify(report,null,2)+'\n');return report;
 }finally{if(store)store.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verify(path.resolve(process.argv[2]||'.'))));
