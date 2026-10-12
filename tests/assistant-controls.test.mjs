import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {JSDOM} from 'jsdom';
import {mountAssistant,renderAnswer,readableAnswer} from '../template/hub/public/assistant.js';
import {mountFloatingAssistant} from '../template/hub/public/floating-assistant.js';
import {openStore} from '../template/hub/runtime/store.mjs';
import {workspaceAPI} from '../template/hub/runtime/api.mjs';
import {openRouterFetch} from '../template/packages/ai-client/index.cjs';

const feature={id:'analysis',title:'Scenario analysis',path:'/features/analysis',group:'Testing',mode:'records',ai:true,fields:[{name:'amount',label:'Amount',type:'number'},{name:'date',label:'Review date',type:'date'},{name:'priority',label:'Priority',options:['Normal','High','Urgent']},{name:'notes',label:'Optional notes',type:'textarea'}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(r=>setTimeout(r,0));
function browser(){
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/features/analysis'}),prior={};
 for(const key of ['document','window','Option','location','sessionStorage']){prior[key]=globalThis[key];globalThis[key]=dom.window[key];}
 return ()=>{dom.window.dispatchEvent(new dom.window.Event('workspace:navigate'));dom.window.close();for(const [key,value] of Object.entries(prior)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}};
}
const byText=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
const answer=label=>({id:label,question:label,answer:'## Recommendation\n'+label,model:'fixture',created_at:new Date().toISOString(),context:{}});

test('all examples fill supporting fields, optional context, and additional questions without calling AI',async()=>{
 const cleanup=browser();try{
  let calls=0;const root=mountAssistant({feature,records:[{id:'real-record',title:'Saved facts'}],settings:{aiConfigured:true},link:()=>document.createElement('a'),api:async url=>{assert.match(url,/answers$/);calls++;return [];}});document.body.append(root);await flush();
  byText(root,'+ Add question').click();
  for(const label of ['Analysis example','Draft example','Action plan example']){
   byText(root,label).click();
   for(const input of root.querySelectorAll('[name^="support."],textarea'))assert.ok(input.value.trim(),input.name||'additional question');
   assert.equal(root.querySelector('[name="recordId"]').value,'real-record');assert.equal(root.querySelector('form').checkValidity(),true);
  }
  assert.equal(calls,1,'only the initial history read is permitted');
 }finally{cleanup();}
});

test('cancel and navigation suppress late responses and permit a new request',async()=>{
 const cleanup=browser();try{
  const pending=[];const root=mountAssistant({feature,records:[],settings:{aiConfigured:true},link:()=>document.createElement('a'),api:async(url,options)=>{if(!url.endsWith('/ask'))return [];const item=deferred();pending.push({...item,signal:options.signal});return item.promise;}});document.body.append(root);await flush();
  byText(root,'Analysis example').click();const form=root.querySelector('form');form.dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(pending.length,1);
  byText(root,'Cancel request').click();assert.equal(pending[0].signal.aborted,true);assert.ok(root.querySelector('[name="question"]').value);assert.equal(byText(root,'Ask AI').disabled,false);
  form.dispatchEvent(new window.Event('submit',{cancelable:true}));pending[0].resolve(answer('OLD CANCELED ANSWER'));await flush();assert.doesNotMatch(root.querySelector('.answer-panel').textContent,/OLD CANCELED/);
  pending[1].resolve(answer('CURRENT ANSWER'));await flush();assert.match(root.querySelector('.answer-panel').textContent,/CURRENT ANSWER/);
  byText(root,'Action plan example').click();form.dispatchEvent(new window.Event('submit',{cancelable:true}));window.dispatchEvent(new window.Event('workspace:navigate'));assert.equal(pending[2].signal.aborted,true);pending[2].resolve(answer('UNMOUNTED ANSWER'));await flush();assert.doesNotMatch(root.querySelector('.answer-panel').textContent,/UNMOUNTED/);
 }finally{cleanup();}
});

test('structured and fenced answers become labeled cards and tables without executing HTML',()=>{
 const cleanup=browser();try{
  const result=renderAnswer('## Review\n```json\n{"executive_summary":"<img src=x onerror=alert(1)>","risk_scores":[{"risk":"Delay","impact":"High"}],"next_steps":["Confirm owner","Review evidence"]}\n```');
  assert.match(result.textContent,/Executive summary/);assert.match(result.textContent,/Risk scores/);assert.match(result.textContent,/Confirm owner/);assert.ok(result.querySelector('table'));assert.equal(result.querySelectorAll('pre,img,script').length,0);
  assert.equal(renderAnswer('{"approved":false,"amount":0}').querySelector('pre'),null);assert.match(renderAnswer('{"approved":false,"amount":0}').textContent,/No/);
  const copied=readableAnswer('{"executive_summary":"Review supplied facts","checks":[{"check":"Approval","status":"Pending"}]}');assert.match(copied,/Executive summary:\n\n?Review supplied facts/);assert.match(copied,/Check \| Status\nApproval \| Pending/);assert.doesNotMatch(copied,/[{}]|executive_summary/);
  const nested=JSON.stringify({findings:'{"record_id":"actual-42","next_step":"Confirm consent"}',rows:[{report:'```json\n{"review_owner":"Actual owner"}\n```'}]});
  const rendered=renderAnswer(nested);assert.match(rendered.textContent,/actual-42/);assert.match(rendered.textContent,/Next step/);assert.match(rendered.textContent,/Review owner/);assert.doesNotMatch(rendered.textContent,/"record_id"|```json/);
  const nestedCopy=readableAnswer(nested);assert.match(nestedCopy,/Record id:\n\n?actual-42/);assert.match(nestedCopy,/Review owner:\n\n?Actual owner/);assert.doesNotMatch(nestedCopy,/"review_owner"|```json/);
  assert.ok(renderAnswer('```javascript\nconst x = 1;\n```').querySelector('pre'),'actual code remains readable code');
 }finally{cleanup();}
});

test('floating assistant examples and close/cancel reject a late response',async()=>{
 const cleanup=browser();try{
  const pending=deferred();let signal,calls=0;const widget=mountFloatingAssistant({catalog:{app:{id:'fixture',productName:'Fixture'},features:[feature],assistants:[]},settings:{aiConfigured:true},link:()=>document.createElement('a'),api:async(url,options)=>{if(!url.endsWith('/ask'))return [];calls++;signal=options.signal;return pending.promise;}});widget.open();await flush();const panel=document.querySelector('.floating-ai');byText(panel,'Plan next steps').click();assert.ok(panel.querySelector('textarea').value);assert.equal(calls,0);panel.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(calls,1);byText(panel,'Cancel request').click();assert.equal(signal.aborted,true);pending.resolve(answer('LATE FLOATING ANSWER'));await flush();assert.doesNotMatch(panel.textContent,/LATE FLOATING/);assert.equal(byText(panel,'Send question').disabled,false);
 }finally{cleanup();}
});

for(const route of ['feature','floating','draft'])test(`disconnect cancels ${route} provider work and cannot persist a late answer`,async()=>{
 const store=openStore(':memory:',[feature]),started=deferred(),release=deferred(),aborted=deferred(),finished=deferred();let signal;
 const record=store.create(feature.id,{title:'Disposable record',data:{amount:0}});
 const api=workspaceAPI(store,{features:[feature],complete:async(_body,options)=>{signal=options.signal;signal.addEventListener('abort',aborted.resolve,{once:true});started.resolve();await release.promise;return {model:'fixture',choices:[{message:{content:'Late provider answer'}}]};}});
 const server=http.createServer(async(req,res)=>{try{await api(req,res,new URL(req.url,'http://'+req.headers.host));}finally{finished.resolve();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const path=route==='feature'?'/features/analysis/ask':route==='floating'?'/assistant/ask':`/records/${record.id}/ai`,input=route==='draft'?{instructions:'Review saved facts'}:{question:'Review supplied facts',...(route==='floating'?{pagePath:feature.path}:{})};
  const controller=new AbortController(),request=fetch(`http://127.0.0.1:${server.address().port}/api/workspace${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Legal-Workspace':'1'},body:JSON.stringify(input),signal:controller.signal});request.catch(()=>{});
  await started.promise;controller.abort();await assert.rejects(request);await aborted.promise;assert.equal(signal.aborted,true);release.resolve();await finished.promise;assert.equal(store.answers(feature.id).length,0);assert.equal(store.drafts(record.id).length,0);assert.equal(store.audit().filter(r=>/ai|answer|draft/i.test(r.action)).length,0);
 }finally{release.resolve();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
});

test('provider transport rejects a late response even when a transport ignores abort',async()=>{
 const controller=new AbortController(),release=deferred(),started=deferred();const request=openRouterFetch({headers:{authorization:'Bearer fixture'},body:JSON.stringify({model:'fixture',messages:[{role:'user',content:'Review'}]}),signal:controller.signal},async()=>{started.resolve();await release.promise;return new Response(JSON.stringify({choices:[{message:{content:'Late'}}]}));});await started.promise;controller.abort();release.resolve();await assert.rejects(request,e=>e.code==='AI_ABORTED');
});
