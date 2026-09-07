import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';
import {createChatCompletion} from '../template/packages/ai-client/index.cjs';
const builder=path.resolve(import.meta.dirname,'..'),root=path.dirname(builder),report=JSON.parse(fs.readFileSync(path.join(builder,'reports/env-merge-results.json'),'utf8'));
const models=[...new Set(report.results.map(r=>r.model))],results=[];
for(const model of models){const app=report.results.find(r=>r.model===model),env=parseEnv(fs.readFileSync(path.join(root,app.id,'.env'),'utf8'));process.env.OPENROUTER_API_KEY=env.OPENROUTER_API_KEY;process.env.OPENROUTER_MODEL=model;
 try{const response=await createChatCompletion({model,messages:[{role:'user',content:'Reply with exactly: AI connection verified.'}],max_tokens:32});const answer=response.choices?.[0]?.message?.content;if(typeof answer!=='string'||!answer.trim())throw new Error('No answer text returned');results.push({model,status:'passed',returnedModel:response.model,answerReceived:true});}
 catch(e){results.push({model,status:'failed',error:e.code?.startsWith('AI_')?e.message:'No usable answer returned'});}
 console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(path.join(builder,'reports/env-live-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),results},null,2)+'\n');if(results.some(r=>r.status!=='passed'))process.exitCode=1;
