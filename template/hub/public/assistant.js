import {WORD_LIMIT,MAX_INPUT_CHARACTERS,countWords} from './ai-limits.js';
const node=(tag,cls='',text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function inline(parent,text){
 const pattern=/(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;let last=0;
 for(const m of text.matchAll(pattern)){parent.append(document.createTextNode(text.slice(last,m.index)));if(m[2])parent.append(node('strong','',m[2]));else if(m[3])parent.append(node('code','',m[3]));else{const a=node('a','',m[4]);a.href=m[5];a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}last=m.index+m[0].length;}
 parent.append(document.createTextNode(text.slice(last)));
}
const readableLabel=value=>String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
function structuredValue(text){try{const value=JSON.parse(text);return value&&typeof value==='object'?value:undefined;}catch{return undefined;}}
const JSON_TOKEN=/(?<key>"(?:\\.|[^"\\])*")(?<colon>\s*:)|(?<str>"(?:\\.|[^"\\])*")|(?<bool>\b(?:true|false)\b)|(?<nul>\bnull\b)|(?<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
function jsonTree(value){const pre=node('pre','answer-json'),code=node('code'),text=JSON.stringify(value,null,2);let last=0;
 for(const m of text.matchAll(JSON_TOKEN)){code.append(document.createTextNode(text.slice(last,m.index)));
  if(m.groups.key!==undefined){code.append(node('span','answer-json-key',m.groups.key));if(m.groups.colon)code.append(document.createTextNode(m.groups.colon));}
  else if(m.groups.str!==undefined)code.append(node('span','answer-json-string',m.groups.str));
  else if(m.groups.bool!==undefined)code.append(node('span','answer-json-bool',m.groups.bool));
  else if(m.groups.nul!==undefined)code.append(node('span','answer-json-null',m.groups.nul));
  else code.append(node('span','answer-json-number',m.groups.num));
  last=m.index+m[0].length;}
 code.append(document.createTextNode(text.slice(last)));pre.append(code);return pre;}
function renderStructured(value,depth=0){
 const out=node('section','answer-structured');
 if(depth>20){out.append(node('p','','Additional nested detail is available in the copied or downloaded answer.'));return out;}
 if(Array.isArray(value)){
  if(!value.length){out.append(node('p','muted','No items supplied.'));return out;}
  const keys=[...new Set(value.flatMap(item=>item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item):[]))];
  if(keys.length&&keys.length<=8&&value.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&Object.values(item).every(v=>v===null||typeof v!=='object'))){
   const wrap=node('div','answer-table'),table=node('table'),head=node('thead'),row=node('tr');for(const key of keys)row.append(node('th','',readableLabel(key)));head.append(row);table.append(head);const body=node('tbody');for(const item of value){const row=node('tr');for(const key of keys){const cell=node('td');cell.append(renderStructured(item[key],depth+1));row.append(cell);}body.append(row);}table.append(body);wrap.append(table);out.append(wrap);
  }else{const list=node('ol','answer-items');for(const item of value){const entry=node('li');entry.append(renderStructured(item,depth+1));list.append(entry);}out.append(list);}return out;
 }
 if(value&&typeof value==='object'){
  const details=node('dl','answer-values');for(const [key,item] of Object.entries(value)){const entry=node('div');entry.append(node('dt','',readableLabel(key)));const content=node('dd');content.append(renderStructured(item,depth+1));entry.append(content);details.append(entry);}out.append(details);if(!Object.keys(value).length)out.append(node('p','muted','No details supplied.'));return out;
 }
 if(typeof value==='string'){
  const parsed=structuredValue(value.trim().replace(/^\x60\x60\x60(?:json)?\s*\n?([\s\S]*?)\n?\x60\x60\x60$/i,'$1'));
  if(parsed!==undefined)return renderStructured(parsed,depth+1);
  if(/\x60\x60\x60json/i.test(value))return renderAnswer(value);
 }
 const formatted=value===null||value===undefined?'Not supplied':value===''?'Empty':typeof value==='boolean'?(value?'Yes':'No'):String(value);for(const line of formatted.split('\n')){if(!line.trim())continue;const p=node('p');inline(p,line);out.append(p);}return out;
}
export function renderAnswer(text){
 text=String(text??'');const out=node('div','answer-markdown'),whole=structuredValue(text.trim());if(whole!==undefined){out.append(renderStructured(whole));return out;}
 const lines=text.replace(/\r\n/g,'\n').split('\n');let i=0;
 const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
 while(i<lines.length){let line=lines[i];if(!line.trim()){i++;continue;}
  if(/^```/.test(line.trim())){const language=line.trim().slice(3).trim().toLowerCase(),code=[];i++;while(i<lines.length&&!/^```/.test(lines[i].trim()))code.push(lines[i++]);i++;const content=code.join('\n'),value=['json',''].includes(language)?structuredValue(content):undefined;if(value!==undefined)out.append(renderStructured(value));else if(language==='json'){out.append(node('p','assistant-error','This structured section could not be read. Try generating the answer again.'));}else{const pre=node('pre');pre.append(node('code','',content));out.append(pre);}continue;}
  if(i+1<lines.length&&line.includes('|')&&cells(lines[i+1]).every(x=>/^:?-{3,}:?$/.test(x))){const wrap=node('div','answer-table'),table=node('table'),head=node('thead'),header=node('tr');for(const cell of cells(line)){const th=node('th');inline(th,cell);header.append(th);}head.append(header);table.append(head);i+=2;const body=node('tbody');while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){const row=node('tr');for(const cell of cells(lines[i++])){const td=node('td');inline(td,cell);row.append(td);}body.append(row);}table.append(body);wrap.append(table);out.append(wrap);continue;}
  const h=line.match(/^(#{1,6})\s+(.+)/);if(h){const heading=node('h'+Math.min(4,h[1].length+1));inline(heading,h[2]);out.append(heading);i++;continue;}
  if(/^\s*([-*+] |\d+[.)] )/.test(line)){const ordered=/^\s*\d+[.)] /.test(line),list=node(ordered?'ol':'ul');while(i<lines.length&&(ordered?/^\s*\d+[.)] /:/^\s*[-*+] /).test(lines[i])){const item=node('li');inline(item,lines[i++].replace(/^\s*(?:[-*+]|\d+[.)])\s+/,''));list.append(item);}out.append(list);continue;}
  const paragraph=node(line.startsWith('> ')?'blockquote':'p');inline(paragraph,line.replace(/^> /,''));out.append(paragraph);i++;
 }
 return out;
}
export function readableAnswer(text){
 const read=element=>{
  if(element.nodeType===3)return element.textContent;
  if(element.tagName==='TABLE')return [...element.children].flatMap(section=>[...section.children]).map(row=>[...row.children].map(cell=>[...cell.childNodes].map(read).join('').trim()).join(' | ')).join('\n')+'\n\n';
  if(element.tagName==='DT')return element.textContent+':\n';
  if(element.tagName==='LI')return '- '+[...element.childNodes].map(read).join('').trim()+'\n';
  const content=[...element.childNodes].map(read).join('');
  return /^(P|H[1-6]|PRE|BLOCKQUOTE|DD)$/.test(element.tagName)?content.trim()+'\n\n':content;
 };
 return read(renderAnswer(text)).replace(/\n{3,}/g,'\n\n').trim();
}
export function mountAssistant({feature:f,records,api,settings,link,capabilities=[],initialFeature}){
 const merged=capabilities.length>0,query=merged?'?merged=1':'';
 const root=node('section','assistant-workspace');root.setAttribute('aria-label',f.title+' AI workspace');
 const banner=node('div','assistant-banner'),intro=node('div');intro.append(node('p','eyebrow','AI WORKSPACE'),node('h2','','Ask a question. Get a useful answer.'),node('p','','Choose related capabilities, combine up to 10 questions, and get one organized answer with shared context.'));
 const connection=node('span','assistant-connection'+(settings.aiConfigured?' connected':''),settings.aiConfigured?'AI connected':'Setup needed');banner.append(intro,connection);root.append(banner);
 if(!settings.aiConfigured){const notice=node('div','notice');notice.append(node('strong','','Connect your AI provider to get answers. '),link('Open AI settings','/settings','secondary'));root.append(notice);}
 const grid=node('div','assistant-grid'),composer=node('section','panel question-panel'),answerPanel=node('section','panel answer-panel');
 const form=node('form'),extraQuestions=[];
 const capabilitySection=node('details','capability-picker'),capabilityList=node('div','capability-list'),capabilityChecks=[];
 if(merged){capabilitySection.append(node('summary','','Choose capabilities ('+capabilities.length+' available)'));const search=node('input');search.type='search';search.placeholder='Find a capability…';search.setAttribute('aria-label','Find an AI capability');capabilitySection.append(search);for(const item of capabilities){const label=node('label','capability-option'),check=node('input');check.type='checkbox';check.value=item.id;check.checked=item.id===(initialFeature||f.id);label.append(check,node('span','',item.title));capabilityList.append(label);capabilityChecks.push({item,check,label});}search.addEventListener('input',()=>{for(const item of capabilityChecks)item.label.hidden=!item.item.title.toLowerCase().includes(search.value.toLowerCase());});capabilitySection.append(capabilityList,node('p','muted','Select up to 8 related capabilities for one combined response.'));form.append(capabilitySection);}
 const selectionLabel=node('p','selected-capabilities');if(merged)form.append(selectionLabel);
 function updateCapabilities(){if(!merged)return;const chosen=capabilityChecks.filter(x=>x.check.checked);selectionLabel.textContent=chosen.length?chosen.map(x=>x.item.title).join(' · '):'Choose at least one capability.';capabilitySection.querySelector('summary').textContent='Capabilities ('+chosen.length+' selected · '+capabilities.length+' available)';}for(const {check} of capabilityChecks)check.addEventListener('change',updateCapabilities);updateCapabilities();
 const label=node('label','field'),question=node('textarea','question-input');question.name='question';question.required=true;question.maxLength=MAX_INPUT_CHARACTERS;question.rows=5;question.placeholder='What would you like help with?';label.append(node('span','','Your question'),question);form.append(label);
 const counter=node('p','question-word-count');counter.id='question-word-count-'+f.id;question.setAttribute('aria-describedby',counter.id);form.append(counter);
 function updateCount(){const words=countWords(question.value)+extraQuestions.reduce((n,x)=>n+countWords(x.input.value),0);counter.textContent=words.toLocaleString()+' / 5,000 words';counter.classList.toggle('over-limit',words>WORD_LIMIT);question.setCustomValidity(words>WORD_LIMIT?'Please shorten the combined questions to 5,000 words or fewer.':'');}question.addEventListener('input',updateCount);updateCount();
 const additional=node('div','additional-questions'),add=node('button','secondary','+ Add question');add.type='button';form.append(additional,add,node('p','muted','Up to 10 questions, 5,000 input words in total. One combined answer of up to 5,000 words. Repeated identical questions are answered once.'));
 function addQuestion(value=''){if(extraQuestions.length>=9)return;const wrap=node('div','extra-question'),label=node('label','field'),input=node('textarea');input.rows=3;input.required=true;input.maxLength=MAX_INPUT_CHARACTERS;input.value=value;label.append(node('span','','Additional question'),input);const remove=node('button','secondary','Remove question');remove.type='button';const item={wrap,input};extraQuestions.push(item);remove.addEventListener('click',()=>{extraQuestions.splice(extraQuestions.indexOf(item),1);wrap.remove();add.disabled=false;updateCount();});input.addEventListener('input',updateCount);wrap.append(label,remove);additional.append(wrap);add.disabled=extraQuestions.length>=9;updateCount();input.focus();}
 function clearAdditional(){extraQuestions.splice(0);additional.replaceChildren();add.disabled=false;}
 add.addEventListener('click',()=>addQuestion());

 const examples=node('div','question-examples');
 for(const [index,label] of ['Analysis example','Draft example','Action plan example'].entries()){
  const button=node('button','secondary',label);button.type='button';button.addEventListener('click',()=>fillExample(index));examples.append(button);
 }
 form.append(examples,node('p','muted','Examples fill the complete brief, including optional fields. Review the scenario, then click Ask AI.'));
 const contextDetails=node('details','assistant-context');contextDetails.append(node('summary','','Add supporting information (optional)'));
 const recordLabel=node('label','field'),record=node('select');record.name='recordId';record.append(new Option('No record — use my question and fields',''));for(const r of records)record.append(new Option((merged?(capabilities.find(c=>c.id===r.feature)?.title||'Record')+' · ':'')+r.title,r.id));recordLabel.append(node('span','','Use a saved record'),record);contextDetails.append(recordLabel);
 if(merged){const typeLabel=node('label','field'),type=node('select'),searchLabel=node('label','field'),search=node('input');type.name='contextFeature';type.append(new Option('All related capabilities',''));for(const item of capabilities)type.append(new Option(item.title,item.id));typeLabel.append(node('span','','Filter record capability'),type);search.type='search';search.maxLength=200;search.placeholder='Find an older record by name…';search.setAttribute('aria-label','Find a saved record');searchLabel.append(node('span','','Find a saved record'),search);contextDetails.insertBefore(typeLabel,recordLabel);contextDetails.insertBefore(searchLabel,recordLabel);let request=0,timer;
 async function refreshRecords(){const version=++request;record.disabled=true;history.disabled=true;record.dataset.loading='1';record.value='';try{const list=await api(`/api/workspace/features/${f.id}/context-records?merged=1&feature=${encodeURIComponent(type.value)}&q=${encodeURIComponent(search.value)}`);if(version!==request)return;record.replaceChildren(new Option('No record — use my question and fields',''));for(const r of list)record.append(new Option((capabilities.find(c=>c.id===r.feature)?.title||'Record')+' · '+r.title,r.id));}catch(e){if(version===request)fail(e);}finally{if(version===request){delete record.dataset.loading;record.disabled=busy;history.disabled=busy;}}}
 type.addEventListener('change',refreshRecords);search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(refreshRecords,180);});}
 const inputs=[];for(const field of f.fields){const label=node('label','field'),input=node(field.type==='textarea'?'textarea':field.options?'select':'input');input.name='support.'+field.name;input.dataset.field=field.name;if(field.options){input.append(new Option('Not supplied',''));for(const option of field.options)input.append(new Option(option,option));}else{if(input.tagName==='INPUT')input.type=field.type==='number'?'number':field.type==='date'?'date':'text';if(field.type==='number')input.step='any';input.maxLength=4000;}if(field.type==='reference')continue;label.append(node('span','',field.label),input);inputs.push({field,input});contextDetails.append(label);}
 const contextLabel=node('label','field'),context=node('textarea');context.name='context';context.rows=4;context.maxLength=12000;context.placeholder='Paste relevant facts, source excerpts, constraints or the outcome you want.';contextLabel.append(node('span','','Additional context'),context);contextDetails.append(contextLabel,node('p','muted','Your selected capabilities, questions, supplied context, selected record and recent conversation are sent together in one AI request. Record attachments are not read automatically.'));form.append(contextDetails);
 function fillExample(index){
  const title=f.title.toLowerCase(),focus=['Analyze the supplied facts, identify missing evidence, and prioritize the next decisions.','Prepare a draft for review, with an executive summary, supporting reasons, and proposed next steps.','Create a practical action plan with responsibilities, dependencies, and review checkpoints.'][index];
  question.value=`For ${title}: ${focus}`;
  context.value=`Example scenario for ${f.title}. Goal: ${['assess options and risks','prepare a clear working draft','plan the next 30 days'][index]}. Audience: the responsible project lead. Constraints: ${['limited staff and a fixed budget','use only supplied evidence and clearly identify assumptions','complete a small pilot before wider adoption'][index]}. Dates and numeric values in the supporting fields are illustrative. Any selected saved record is actual workspace data; review it before sending. Attachments have not been read. Success criteria: a clear recommendation, an evidence checklist, and actionable follow-up.`;
  for(const {field,input} of inputs){
   if(field.options){const choices=field.options.filter(option=>String(option??'').trim()!=='');input.value=String(choices[Math.min(index,choices.length-1)]??'');}
   else if(field.type==='number')input.value=String([1200,3500,800][index]);
   else if(field.type==='date')input.value=['2026-11-02','2026-11-16','2026-12-01'][index];
   else input.value=`${field.label}: ${['baseline scenario; review the supplied facts and highlight any gaps','draft scenario; use a concise professional tone and cite only supplied evidence','planning scenario; propose owners, milestones, and a review checkpoint'][index]}.`;
  }
  for(const [n,item] of extraQuestions.entries())item.input.value=`For ${title}, ${['what evidence supports the recommendation','which assumptions need review','what should the owner do next'][(index+n)%3]}?`;
  if(!record.value&&record.options.length>1&&record.dataset.loading!=='1')record.value=record.options[1].value;
  if(merged&&!capabilityChecks.some(x=>x.check.checked)){const chosen=capabilityChecks.find(x=>x.item.id===(initialFeature||f.id))||capabilityChecks[0];if(chosen)chosen.check.checked=true;updateCapabilities();}
  contextDetails.open=true;error.hidden=true;status.textContent=record.value?'Complete example loaded with a saved record. Review the selected record and all fields, then click Ask AI.':'Complete example loaded. No saved record is available; the supplied brief will be used. Review all fields, then click Ask AI.';updateCount();question.focus();
 }
 const actions=node('div','assistant-submit'),ask=node('button','primary','Ask AI'),fresh=node('button','secondary','New question'),cancel=node('button','secondary','Cancel request');ask.type='submit';fresh.type='button';cancel.type='button';cancel.hidden=true;actions.append(ask,cancel,fresh);const status=node('p','assistant-status');status.setAttribute('role','status');const error=node('div','assistant-error');error.hidden=true;error.setAttribute('role','alert');form.append(actions,status,error);composer.append(form);
 const historyLabel=node('label','field answer-history'),history=node('select');history.setAttribute('aria-label','Saved AI answers');historyLabel.append(node('span','','Saved answers'),history);composer.append(historyLabel);grid.append(composer,answerPanel);root.append(grid);
 let current=null,busy=false,selection=0,requestController=null,disposed=false;
 const fail=e=>{error.textContent=e.message;error.hidden=false;};
 function empty(){answerPanel.replaceChildren(node('span','answer-symbol','✦'),node('h2','','Your answer will appear here'),node('p','','Ask for an explanation, a draft, a comparison or a practical plan, with detailed answers up to 5,000 words. Your answers are saved so you can return and continue.'));answerPanel.classList.add('answer-empty');}
 function display(r){current=r;answerPanel.classList.remove('answer-empty');const top=node('div','answer-heading'),copy=node('div');copy.append(node('p','eyebrow','AI RESPONSE · REVIEW BEFORE USE'),node('h2','',r.question.length>250?r.question.slice(0,247)+'…':r.question),node('p','muted',`${r.model} · ${new Date(r.created_at).toLocaleString()} · ${countWords(r.answer).toLocaleString()} words`));if(r.question.length>250){const full=node('details','full-ai-question');full.append(node('summary','','View full question ('+countWords(r.question).toLocaleString()+' words)'),node('p','',r.question));copy.append(full);}if(r.context?.questions?.length>1)copy.append(node('p','combined-answer-info',`${r.context.questions.length} questions combined · ${r.context.capabilities?.length||1} capabilities${r.context.duplicateQuestionsRemoved?' · '+r.context.duplicateQuestionsRemoved+' repeated questions removed':''}`));top.append(copy);const tools=node('div','actions'),copyButton=node('button','secondary','Copy answer'),download=node('button','secondary','Download');for(const b of [copyButton,download])b.type='button';copyButton.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(readableAnswer(r.answer));status.textContent='Answer copied.';}catch{fail(new Error('Copy is unavailable in this browser. Use Download instead.'));}});download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['# '+r.question+'\n\n'+readableAnswer(r.answer)],{type:'text/markdown;charset=utf-8'})),a=node('a');a.href=url;a.download=f.id+'-answer.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});tools.append(copyButton,download);const structured=structuredValue(r.answer.trim()),rendered=renderAnswer(r.answer),body=node('div','answer-body');body.append(rendered);if(structured!==undefined){const jsonButton=node('button','secondary','View JSON');jsonButton.type='button';let showingJson=false;jsonButton.addEventListener('click',()=>{showingJson=!showingJson;jsonButton.textContent=showingJson?'Formatted view':'View JSON';body.replaceChildren(showingJson?jsonTree(structured):rendered);status.textContent=showingJson?'Showing the raw JSON returned by the provider.':'';});tools.insertBefore(jsonButton,copyButton);}answerPanel.replaceChildren(top,body,tools);question.placeholder='Ask a follow-up about this answer…';fresh.textContent='New question';}
 async function loadHistory(){const version=selection,list=await api(`/api/workspace/features/${f.id}/answers${query}`);if(disposed||version!==selection)return;history.replaceChildren(new Option(list.length?'Select a saved answer…':'No saved answers yet',''));for(const r of list)history.append(new Option(r.question.slice(0,90),r.id));if(current)history.value=current.id;}
 function lock(value){busy=value;for(const control of form.querySelectorAll('input,textarea,select,button'))control.disabled=value;history.disabled=value;ask.textContent=value?'Thinking…':'Ask AI';cancel.hidden=!value;cancel.disabled=false;if(!value){add.disabled=extraQuestions.length>=9;record.disabled=record.dataset.loading==='1';history.disabled=record.dataset.loading==='1';}answerPanel.setAttribute('aria-busy',String(value));}
 function cancelRequest(){if(!requestController)return;selection++;requestController.abort();requestController=null;lock(false);status.textContent='Request canceled. Your brief is still here.';}
 cancel.addEventListener('click',cancelRequest);
 window.addEventListener('workspace:navigate',()=>{disposed=true;selection++;requestController?.abort();requestController=null;},{once:true});
 fresh.addEventListener('click',()=>{current=null;selection++;history.value='';question.value='';clearAdditional();updateCount();question.placeholder='What would you like help with?';error.hidden=true;status.textContent='Started a new question. Saved answers are still available.';empty();question.focus();});
 history.addEventListener('change',async()=>{if(!history.value||busy)return;const version=++selection;try{const r=await api(`/api/workspace/features/${f.id}/answers/${history.value}${query}`);if(disposed||version!==selection)return;display(r);question.value='';clearAdditional();updateCount();context.value=r.context.additionalContext||'';const priorRecord=r.context.selectedRecord;if(priorRecord&&!Array.from(record.options).some(o=>o.value===priorRecord.id))record.append(new Option(priorRecord.title,priorRecord.id));record.value=priorRecord?.id||'';for(const {field,input} of inputs)input.value=r.context.supportingFields?.[field.label]??'';if(merged){const ids=r.context.capabilities?.map(c=>c.id)||[r.feature];for(const {check} of capabilityChecks)check.checked=ids.includes(check.value);updateCapabilities();}status.textContent='Saved answer loaded. You can ask a follow-up.';}catch(e){fail(e);}});
 form.addEventListener('submit',async e=>{e.preventDefault();updateCount();if(busy||!question.value.trim()||!form.reportValidity())return;const version=++selection;error.hidden=true;if(!settings.aiConfigured){fail(new Error('AI is not connected. Open Settings to configure your provider, then restart the app.'));return;}
  if(record.dataset.loading==='1'){fail(new Error('Please wait for the record list to finish loading.'));return;}
  const capabilityIds=capabilityChecks.filter(x=>x.check.checked).map(x=>x.item.id);if(merged&&(capabilityIds.length<1||capabilityIds.length>8)){fail(new Error('Select between 1 and 8 capabilities.'));capabilitySection.open=true;return;}
  const fields={};for(const {field,input} of inputs)if(input.value!=='')fields[field.name]=field.type==='number'?Number(input.value):input.value;
  const controller=new AbortController();requestController=controller;const request={question:question.value.trim(),questions:[question.value.trim(),...extraQuestions.map(x=>x.input.value.trim())],combined:merged,capabilityIds:merged?capabilityIds:undefined,context:context.value,fields,recordId:record.value||undefined,previousAnswerId:current?.id};lock(true);status.textContent='Preparing your answer. Longer responses can take a few minutes…';
  try{const answer=await api(`/api/workspace/features/${f.id}/ask`,{method:'POST',body:JSON.stringify(request),signal:controller.signal});if(disposed||controller.signal.aborted||version!==selection)return;display(answer);question.value='';clearAdditional();updateCount();status.textContent='Answer saved. Ask a follow-up to refine it.';await loadHistory();}catch(e){if(disposed||controller.signal.aborted||version!==selection)return;status.textContent='Your question is still here. You can try again.';fail(e);}finally{if(requestController===controller){requestController=null;if(!disposed)lock(false);}}

 });
 empty();loadHistory().catch(e=>{if(!disposed)fail(e);});return root;
}
