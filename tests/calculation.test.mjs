import test from 'node:test';import assert from 'node:assert/strict';import {createHub} from '../../property-platform/dist/hub/server.mjs';import {features} from '../../property-platform/dist/scripts/workspace.mjs';
test('preserved CAM adapters calculate area shares and exact fee variances through the native API',async()=>{
 const server=createHub({databasePath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(url,body)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-Legal-Workspace':'1'},body:JSON.stringify(body)});
 try{
  for(const [sourceId,input,expected] of [['pro-rata',{tenantAreaSqFt:1000,buildingAreaSqFt:10000,proRataPercent:10},['calculatedSharePercent',10]],['admin-fees',{feeBase:1000,feePercent:10,billedAmount:120,allowedAmount:100},['signedVarianceCents',2000]]]){
   const f=features.find(f=>f.calculations?.some(c=>c.config.engine==='cam'&&c.feature.id===sourceId));assert.ok(f,sourceId);const spec=f.calculations.find(c=>c.config.engine==='cam'&&c.feature.id===sourceId);
   const data={};for(const field of spec.feature.fields)data[field.key]=input[field.key]??field.sample??(field.type==='number'||field.type==='currency'?100:field.type==='select'?field.options[0]:field.type==='date'?'2026-09-07':'Sample input');Object.assign(data,input);
   const created=await post(`/api/workspace/features/${f.id}/records`,{title:'Calculation fixture',data});assert.equal(created.status,201);const row=await created.json();const response=await post(`/api/workspace/records/${row.id}/calculate`,{calculationId:spec.id});const output=await response.json();assert.equal(response.status,201,JSON.stringify(output));assert.equal(output.result[expected[0]],expected[1]);
   assert.ok((await (await fetch(base+`/api/workspace/records/${row.id}/calculations`)).json()).length===1);
   assert.equal((await post(`/api/workspace/records/${row.id}/calculate`,{calculationId:'../../outside'})).status,404);
  }
 }finally{await new Promise(r=>server.close(r));}
});
