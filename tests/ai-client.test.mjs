import test from 'node:test';
import assert from 'node:assert/strict';
import { openRouterFetch, openRouterPost, createChatCompletion } from '../template/packages/ai-client/index.cjs';
const body={model:'test-model',messages:[{role:'user',content:'test prompt'}]};
const options={headers:{authorization:'Bearer test-key'},body:JSON.stringify(body)};
const completion={id:'test',choices:[{message:{content:'Draft for review'}}],usage:{total_tokens:4}};
const ok=()=>new Response(JSON.stringify(completion),{status:200});
test('preserves domain payload and unifies endpoint and headers',async()=>{
 const response=await openRouterFetch(options,async(url,init)=>{
  assert.equal(url,'https://openrouter.ai/api/v1/chat/completions'); assert.deepEqual(JSON.parse(init.body),body);
  assert.equal(init.headers.get('authorization'),'Bearer test-key'); assert.equal(init.headers.get('content-type'),'application/json'); return ok();
 }); assert.deepEqual(await response.json(),completion);
});
test('missing credentials fail before network access',async()=>{
 const before=process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
 try { await assert.rejects(openRouterFetch({...options,headers:{authorization:'Bearer undefined'}},()=>assert.fail('Network must not be called')),e=>e.code==='AI_NOT_CONFIGURED'); }
 finally { if(before!==undefined) process.env.OPENROUTER_API_KEY=before; }
});
test('provider error never leaks response text or retries a billable call',async()=>{
 let calls=0; await assert.rejects(openRouterFetch(options,async()=>{calls++;return new Response('private provider body test-key',{status:429});}),e=>e.code==='AI_PROVIDER_ERROR' && e.status===429 && !e.message.includes('private') && !e.message.includes('test-key')); assert.equal(calls,1);
});
test('invalid JSON and missing completion are rejected',async()=>{
 for(const value of ['not-json','{}','{"error":{"message":"secret"}}']) await assert.rejects(openRouterFetch(options,async()=>new Response(value)),e=>['AI_INVALID_RESPONSE','AI_PROVIDER_ERROR'].includes(e.code));
});
test('timeout includes reading the response body',async()=>{
 await assert.rejects(openRouterFetch({...options,timeoutMs:15},async(_url,{signal})=>({ok:true,status:200,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))})),e=>e.code==='AI_ABORTED');
});
test('upstream cancellation is preserved',async()=>{
 const controller=new AbortController(); controller.abort();
 await assert.rejects(openRouterFetch({...options,signal:controller.signal},async(_url,{signal})=>{assert.equal(signal.aborted,true);throw new Error('aborted');}),e=>e.code==='AI_ABORTED');
});
test('invalid requests do not reach provider',async()=>{
 for(const invalid of ['bad',JSON.stringify({...body,stream:true}),JSON.stringify({...body,messages:[]})]) await assert.rejects(openRouterFetch({...options,body:invalid},()=>assert.fail()),e=>e.code==='AI_INVALID_REQUEST');
});
test('Axios and SDK adapters preserve expected response shapes',async t=>{
 t.mock.method(globalThis,'fetch',async()=>ok());
 const previous=process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY='test-key';
 try { assert.deepEqual((await openRouterPost(body,{headers:options.headers})).data,completion); assert.deepEqual(await createChatCompletion(body),completion); }
 finally { if(previous===undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY=previous; }
});
