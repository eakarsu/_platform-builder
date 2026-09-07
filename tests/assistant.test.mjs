import test from 'node:test';import assert from 'node:assert/strict';
import {openStore} from '../template/hub/runtime/store.mjs';import {answerQuestion} from '../template/hub/runtime/assistant.mjs';
const features=[{id:'analysis',title:'Analysis',group:'Testing',mode:'records',ai:true,fields:[{name:'amount',label:'Amount',type:'number'}]},{id:'other',title:'Other',mode:'records',ai:true,fields:[]}];
test('AI questions use explicit context, save actual answers, and preserve follow-up history',async()=>{
 const store=openStore(':memory:',features);try{const record=store.create('analysis',{title:'Test facts',data:{amount:0}});let payload;
 const complete=async input=>{payload=input;return {model:'test-only',choices:[{message:{content:'## Answer\nUse the supplied facts.'}}]};};
 const first=await answerQuestion(store,features[0],{question:'Review this',fields:{amount:0},recordId:record.id,context:'Known facts'},complete);assert.equal(first.context.supportingFields.Amount,0);assert.equal(first.context.selectedRecord.title,'Test facts');assert.equal(store.answers('analysis').length,1);
 const second=await answerQuestion(store,features[0],{question:'What next?',previousAnswerId:first.id},complete);assert.equal(second.previous_id,first.id);assert.equal(payload.messages.length,4);assert.match(payload.messages[1].content,/Known facts/);assert.match(payload.messages[2].content,/Use the supplied facts/);assert.equal(store.answer(first.id,'analysis').answer,first.answer);
 await assert.rejects(()=>answerQuestion(store,features[1],{question:'Cross feature',previousAnswerId:first.id},complete),/Answer not found/);
 }finally{store.close();}
});
test('Invalid input, wrong record context and provider failures never create an answer',async()=>{
 const store=openStore(':memory:',features);try{let calls=0;const complete=async()=>{calls++;throw new Error('provider unavailable');};const other=store.create('other',{title:'Unrelated',data:{}});
 for(const input of [{question:' '},{question:'word '.repeat(5001)},{question:'x'.repeat(100001)},{question:'Review',fields:{unknown:'x'}},{question:'Review',context:'x'.repeat(12001)},{question:'Review',recordId:other.id}])await assert.rejects(()=>answerQuestion(store,features[0],input,complete));assert.equal(calls,0);
 await assert.rejects(()=>answerQuestion(store,features[0],{question:'Review'},complete),/provider unavailable/);assert.equal(store.answers('analysis').length,0);
 await assert.rejects(()=>answerQuestion(store,features[0],{question:'Review'},async()=>({choices:[{message:{content:''}}]})),/empty or invalid/);assert.equal(store.answers('analysis').length,0);
 }finally{store.close();}
});
test('Questions and stored answers support 5,000 words with a larger response budget and timeout',async()=>{
 const store=openStore(':memory:',features);try{
 const question=Array(5000).fill('question').join(' '),answer=Array(5000).fill('answer').join(' ');let called=0;
 const row=await answerQuestion(store,features[0],{question},async(payload,options)=>{called++;assert.equal(payload.max_tokens,16000);assert.ok(options.timeoutMs>=180000);assert.match(payload.messages[0].content,/5,000 words/);return {model:'test',choices:[{message:{content:answer}}]};});
 assert.equal(called,1);assert.equal(store.answer(row.id,'analysis').question,question);assert.equal(store.answer(row.id,'analysis').answer.split(/\s+/).length,5000);
 await assert.rejects(()=>answerQuestion(store,features[0],{question:question+' extra'},async()=>{called++;}),/5,000 words/);assert.equal(called,1);
 }finally{store.close();}
});
