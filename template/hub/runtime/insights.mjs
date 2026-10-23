import {WorkspaceError} from './store.mjs';
import {createChatCompletion} from '../../packages/ai-client/index.cjs';

const CORE_IDS=new Set(['clients','matters','contacts','tasks','calendar','deadlines','notes','documents','templates','billing','time','messages','reports','audit','connections']);

export function providerConfigured(complete){
 if(complete&&complete!==createChatCompletion)return true;
 if(process.env.FP_NO_PROVIDER==='1')return false;
 if(process.env.OPENROUTER_API_KEY&&process.env.OPENROUTER_MODEL)return true;
 if(process.env.OPENAI_API_KEY)return true;
 return false;
}

async function providerComplete(complete,payload){
 if(complete&&complete!==createChatCompletion)return complete(payload);
 if(process.env.OPENROUTER_API_KEY&&process.env.OPENROUTER_MODEL)return createChatCompletion(payload);
 if(process.env.OPENAI_API_KEY){
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:payload.messages,max_tokens:payload.max_tokens||800})});
  if(!response.ok)throw new WorkspaceError(`AI provider returned HTTP ${response.status}.`,502);
  return response.json();
 }
 throw new WorkspaceError('AI provider is not configured.',503);
}

export function summarizeFeatureData(store,featureId){
 const f=store.feature(featureId);
 const rows=store.list(f.id,{limit:200});
 const byStatus={};for(const r of rows)byStatus[r.status]=(byStatus[r.status]||0)+1;
 const fieldCoverage=f.fields.map(field=>{
  let filled=0;for(const r of rows){const v=r.data[field.name];if(v!==undefined&&v!==null&&v!=='')filled++;}
  return {field:field.name,label:field.label,filled,empty:rows.length-filled};
 });
 return {feature:f.id,featureTitle:f.title,total:rows.length,hasRecords:rows.length>0,byStatus,fieldCoverage,recent:rows.slice(0,5).map(r=>({title:r.title,status:r.status,updated_at:r.updated_at}))};
}

export function priorityActionsData(store,features){
 const has=id=>{if(features)return features.some(f=>f.id===id);try{store.feature(id);return true;}catch{return false;}};
 const today=new Date().toISOString().slice(0,10);
 const week=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const out={today,overdue:[],dueNext7Days:[],unassignedCount:0,openCount:0,hasOverdue:false,overdueCount:0};
 for(const fid of ['tasks','deadlines']){
  if(!has(fid))continue;
  for(const r of store.list(fid,{limit:200})){
   if(['completed','archived'].includes(r.status))continue;
   out.openCount++;
   const due=r.data.due_date||'';
   if(!r.data.assignee&&!r.data.owner)out.unassignedCount++;
   const item={feature:fid,title:r.title,status:r.status,dueDate:due||null,assignee:r.data.assignee||r.data.owner||null};
   if(due&&due<today)out.overdue.push(item);
   else if(due&&due<=week)out.dueNext7Days.push(item);
  }
 }
 out.overdueCount=out.overdue.length;out.hasOverdue=out.overdue.length>0;
 return out;
}

export function recordBriefData(store,recordId){
 const r=store.get(recordId);
 const f=store.feature(r.feature);
 const related=store.related(r.id);
 return {feature:f.id,featureTitle:f.title,recordId:r.id,title:r.title,status:r.status,notes:r.notes||'',fields:f.fields.map(field=>({name:field.name,label:field.label,value:r.data[field.name]===undefined?null:r.data[field.name]})),relatedCount:related.length,relatedTitles:related.slice(0,5).map(x=>x.title),draftCount:store.drafts(r.id).length,attachmentCount:store.attachments(r.id).length};
}

function sectionsFor(title,data){
 if(data.overdue!==undefined&&data.today)return [
  {label:'Open items',value:data.openCount},{label:'Has overdue items',value:data.hasOverdue},{label:'Overdue count',value:data.overdueCount},
  {label:'Unassigned count',value:data.unassignedCount},{label:'Overdue items',value:data.overdue},{label:'Due in next 7 days',value:data.dueNext7Days}];
 if(data.fields)return [
  {label:'Record',value:data.title},{label:'Status',value:data.status},{label:'Notes',value:data.notes},
  ...data.fields.map(f=>({label:f.label,value:f.value})),{label:'Related records',value:data.relatedCount},{label:'Saved drafts',value:data.draftCount},{label:'Attachments',value:data.attachmentCount}];
 return [
  {label:'Feature',value:data.featureTitle},{label:'Total records',value:data.total},{label:'Has records',value:data.hasRecords},
  {label:'Records by status',value:data.byStatus},{label:'Field coverage',value:data.fieldCoverage},
  {label:'Recent records',value:data.recent.map(r=>r.title)}];
}

export function insightCatalog(features=[],app={},configured){
 if(Array.isArray(configured)&&configured.length){
  const valid=configured.filter(d=>d&&d.id&&features.some(f=>f.id===d.feature));
  if(valid.length){const defs=valid.slice(0,4);if(features.some(f=>f.id==='tasks'||f.id==='deadlines')&&!defs.some(d=>d.id==='priority-actions'))defs.push({id:'priority-actions',feature:'tasks',title:'Priority actions',focus:'Overdue and upcoming tasks and deadlines, including unassigned work.'});return defs;}
 }
 const domain=features.filter(f=>f.mode==='records'&&!CORE_IDS.has(f.id)).slice(0,3);
 const defs=domain.map(f=>({id:'insight-'+f.id,feature:f.id,title:f.title+' insight',focus:'Summarize '+f.title+' records: totals, status mix, field coverage and recent activity.'}));
 if(features.some(f=>f.id==='tasks'||f.id==='deadlines'))defs.push({id:'priority-actions',feature:'tasks',title:'Priority actions',focus:'Overdue and upcoming tasks and deadlines, including unassigned work.'});
 return defs;
}

async function finish(store,title,kind,data,complete,signal){
 const generatedAt=new Date().toISOString();
 const sections=sectionsFor(title,data);
 if(!providerConfigured(complete)){
  return {aiGenerated:false,fallback:true,label:'Deterministic fallback — no AI provider configured. Computed directly from workspace records; not AI-generated.',title,kind,generatedAt,sections,data};
 }
 try{
  const result=await providerComplete(complete,{model:process.env.OPENROUTER_MODEL||process.env.OPENAI_MODEL||'test',messages:[{role:'system',content:'You write a short professional narrative using ONLY the supplied computed facts. Do not invent records, dates or outcomes. State uncertainty where facts are missing.'},{role:'user',content:JSON.stringify(data)}],max_tokens:800});
  signal?.throwIfAborted();
  const narrative=result.choices?.[0]?.message?.content;
  if(!narrative)throw new WorkspaceError('No narrative was returned.',502);
  return {aiGenerated:true,fallback:false,label:'AI-generated narrative over workspace records. Review before use.',title,kind,generatedAt,narrative,sections:[{label:'Narrative',value:narrative},...sections],data};
 }catch(error){
  if(signal?.aborted)throw error;
  return {aiGenerated:false,fallback:true,label:'Deterministic fallback — AI provider call failed. Computed directly from workspace records; not AI-generated.',title,kind,generatedAt,providerError:error.message,sections,data};
 }
}

// buildInsight supports: (store, feature, insightDef, complete, {signal}) per-feature,
// and (store, features[], app, insightId, complete, {signal}) global catalog.
export async function buildInsight(store){
 if(Array.isArray(arguments[1])){
  const features=arguments[1],insightId=arguments[3],complete=arguments[4],opts=arguments[5]||{};
  const def=insightCatalog(features,arguments[2],arguments[6]).find(x=>x.id===insightId);
  if(!def)throw new WorkspaceError('Insight not available.',404);
  const data=def.id==='priority-actions'?priorityActionsData(store,features):summarizeFeatureData(store,def.feature);
  return finish(store,def.title,def.id,data,complete,opts.signal);
 }
 const feature=arguments[1],def=arguments[2],complete=arguments[3],opts=arguments[4]||{};
 const data=def.id==='priority-actions'?priorityActionsData(store):summarizeFeatureData(store,feature.id);
 return finish(store,def.title||feature.title+' insight',def.id,data,complete,opts.signal);
}

export async function runInsight(store,{kind,featureId,recordId}={},complete,features=[]){
 if(kind==='summarize-feature'){if(!featureId)throw new WorkspaceError('Choose a feature to summarize.');return finish(store,store.feature(featureId).title+' insight',kind,summarizeFeatureData(store,featureId),complete);}
 if(kind==='priority-actions')return finish(store,'Priority actions',kind,priorityActionsData(store,features),complete);
 if(kind==='record-brief'){if(!recordId)throw new WorkspaceError('Choose a record to brief.');const data=recordBriefData(store,recordId);return finish(store,data.title+' brief',kind,data,complete);}
 throw new WorkspaceError('Unknown insight. Choose summarize-feature, priority-actions or record-brief.',404);
}
