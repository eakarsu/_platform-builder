import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
export class WorkspaceError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function openStore(filename,features){
 if(filename!==':memory:'){mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});}
 const db=new DatabaseSync(filename);
 if(filename!==':memory:')chmodSync(filename,0o600);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, feature TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,practice_area TEXT NOT NULL DEFAULT '',matter_id TEXT REFERENCES records(id),client_id TEXT REFERENCES records(id),notes TEXT NOT NULL DEFAULT '',data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS record_feature ON records(feature,updated_at);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,feature TEXT NOT NULL,record_id TEXT,title TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,content TEXT NOT NULL,model TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,name TEXT NOT NULL,type TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS calculations(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,calculation_id TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS ai_answers(id TEXT PRIMARY KEY,feature TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL,model TEXT NOT NULL,context TEXT NOT NULL,previous_id TEXT,created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS ai_answer_feature ON ai_answers(feature,created_at)');
 const index=new Map(features.map(f=>[f.id,f]));
 const parse=r=>r?{...r,data:JSON.parse(r.data)}:null;
 function feature(id){const f=index.get(id);if(!f)throw new WorkspaceError('Unknown feature.',404);return f;}
 function get(id){const r=parse(db.prepare('SELECT * FROM records WHERE id=?').get(id));if(!r)throw new WorkspaceError('Record not found.',404);return r;}
 function log(action,r){db.prepare('INSERT INTO audit(action,feature,record_id,title,created_at) VALUES(?,?,?,?,?)').run(action,r.feature,r.id,r.title,new Date().toISOString());}
 function validate(f,input){
  if(!input || typeof input!=='object'||Array.isArray(input))throw new WorkspaceError('Provide a record object.');
  const title=String(input.title||'').trim();if(!title||title.length>250)throw new WorkspaceError('A title of 1–250 characters is required.');
  const statuses=f.mode==='integration'?['draft','ready','archived']:['draft','active','review','completed','archived'];
  const status=input.status||'draft';if(!statuses.includes(status))throw new WorkspaceError('Choose a valid status.');
  const data={};for(const field of f.fields){const value=input.data?.[field.name];
   if(field.required&&(value===undefined||value===null||value===''))throw new WorkspaceError(`${field.label} is required.`);
   if(value===undefined||value===null||value==='')continue;
   if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value))throw new WorkspaceError(`${field.label} must be a number.`);data[field.name]=value;}
   else {if(typeof value!=='string'||value.length>50000)throw new WorkspaceError(`${field.label} is too long or invalid.`);if(field.type==='select'&&field.options&&!field.options.includes(value))throw new WorkspaceError(`Choose a valid ${field.label}.`);if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new WorkspaceError(`${field.label} must be a date.`);if(field.type==='reference'&&get(value).feature!==field.reference)throw new WorkspaceError(`Invalid ${field.label} reference.`);data[field.name]=value;}
  }
  const relation=(id,kind)=>{if(!id)return null;const r=get(id);if(r.feature!==kind)throw new WorkspaceError(`Invalid ${kind} reference.`);return id;};
  if(String(input.notes||'').length>50000)throw new WorkspaceError('Notes are too long.');
  return {title,status,data,notes:String(input.notes||''),practice_area:String(input.practice_area||'').slice(0,80),matter_id:relation(input.matter_id,'matters'),client_id:relation(input.client_id,'clients')};
 }
 const api={
  feature,get,
  floatingAnswers(){return db.prepare("SELECT id,feature,question,model,created_at FROM ai_answers WHERE json_extract(context,'$.source')='floating' ORDER BY created_at DESC,rowid DESC LIMIT 50").all();},
  answersForFeatures(ids){for(const id of ids)feature(id);return db.prepare(`SELECT id,feature,question,model,created_at FROM ai_answers WHERE feature IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at DESC,rowid DESC LIMIT 50`).all(...ids);},
  answerForFeatures(id,ids){const row=db.prepare('SELECT feature FROM ai_answers WHERE id=?').get(id);if(!row||!ids.includes(row.feature))throw new WorkspaceError('Answer not found for this assistant.',404);return api.answer(id,row.feature);},
  recordsForFeatures(ids,{q=''}={}){for(const id of ids)feature(id);return db.prepare(`SELECT * FROM records WHERE feature IN (${ids.map(()=>'?').join(',')}) AND (?='' OR title LIKE ? OR notes LIKE ?) ORDER BY updated_at DESC LIMIT 200`).all(...ids,q,'%'+q+'%','%'+q+'%').map(parse);},
  answers(featureId){feature(featureId);return db.prepare('SELECT id,feature,question,model,created_at FROM ai_answers WHERE feature=? ORDER BY created_at DESC,rowid DESC LIMIT 50').all(featureId);},
  answer(id,featureId){const row=db.prepare('SELECT * FROM ai_answers WHERE id=? AND feature=?').get(id,featureId);if(!row)throw new WorkspaceError('Answer not found for this feature.',404);return {...row,context:JSON.parse(row.context)};},
  addAnswer(featureId,input){feature(featureId);const row={id:randomUUID(),feature:featureId,...input,created_at:new Date().toISOString()};db.prepare('INSERT INTO ai_answers VALUES(?,?,?,?,?,?,?,?)').run(row.id,featureId,row.question,row.answer,row.model,JSON.stringify(row.context),row.previous_id||null,row.created_at);log('AI answer saved',{id:row.id,feature:featureId,title:row.question.slice(0,150)});return row;},
  transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},
  calculations(id){get(id);return db.prepare('SELECT * FROM calculations WHERE record_id=? ORDER BY created_at DESC').all(id).map(r=>({...r,result:JSON.parse(r.result)}));},
  addCalculation(id,calculationId,result){const record=get(id),row={id:randomUUID(),record_id:id,calculation_id:calculationId,result,created_at:new Date().toISOString()};db.prepare('INSERT INTO calculations VALUES(?,?,?,?,?)').run(row.id,id,calculationId,JSON.stringify(result),row.created_at);log('calculation saved',record);return row;},
  related(id){get(id);const result=new Map();for(const r of db.prepare('SELECT * FROM records WHERE client_id=? OR matter_id=?').all(id,id))result.set(r.id,parse(r));for(const f of features)for(const field of f.fields.filter(x=>x.type==='reference'))for(const r of db.prepare('SELECT * FROM records WHERE feature=? AND json_extract(data,?)=?').all(f.id,'$.'+field.name,id))result.set(r.id,parse(r));return [...result.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));},
  list(id,{q='',status='',matter='',limit=1000}={}){feature(id);return db.prepare('SELECT * FROM records WHERE feature=? AND (?=\'\' OR title LIKE ? OR notes LIKE ?) AND (?=\'\' OR status=?) AND (?=\'\' OR matter_id=?) ORDER BY updated_at DESC LIMIT ?').all(id,q,'%'+q+'%','%'+q+'%',status,status,matter,matter,Math.min(1000,Math.max(1,Number(limit)||1000))).map(parse);},
  create(id,input){const f=feature(id);if(['report','audit'].includes(f.mode))throw new WorkspaceError('This view is generated from workspace records.');const r=validate(f,input),uid=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO records(id,feature,title,status,practice_area,matter_id,client_id,notes,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(uid,id,r.title,r.status,r.practice_area,r.matter_id,r.client_id,r.notes,JSON.stringify(r.data),now,now);const record=get(uid);log('created',record);return record;},
  update(id,input){const old=get(id),r=validate(feature(old.feature),input);if(input.revision!==old.revision)throw new WorkspaceError('This record changed. Reload it before saving.',409);db.prepare('UPDATE records SET title=?,status=?,practice_area=?,matter_id=?,client_id=?,notes=?,data=?,revision=revision+1,updated_at=? WHERE id=?').run(r.title,r.status,r.practice_area,r.matter_id,r.client_id,r.notes,JSON.stringify(r.data),new Date().toISOString(),id);const record=get(id);log('updated',record);return record;},
  remove(id){const r=get(id);for(const f of features)for(const field of f.fields.filter(x=>x.type==='reference')){if(db.prepare('SELECT id FROM records WHERE feature=? AND json_extract(data,?)=? LIMIT 1').get(f.id,'$.'+field.name,id))throw new WorkspaceError('This record is linked to other work. Archive it instead.',409);}if(db.prepare('SELECT id FROM records WHERE matter_id=? OR client_id=? LIMIT 1').get(id,id))throw new WorkspaceError('This record is linked to other work. Archive it instead.',409);db.prepare('DELETE FROM records WHERE id=?').run(id);log('deleted',r);},
  audit(){return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all();},
  summary(){const counts=db.prepare('SELECT feature,COUNT(*) AS total FROM records WHERE status!=\'archived\' GROUP BY feature').all();const totals={};for(const r of counts)totals[r.feature]=r.total;const all=db.prepare('SELECT * FROM records WHERE status!=\'archived\'').all().map(parse);return {total:all.length,counts:totals,review:all.filter(r=>r.status==='review').length,invoiceTotal:all.filter(r=>r.feature==='billing').reduce((sum,r)=>sum+(Number(r.data.amount)||0),0),hours:all.filter(r=>r.feature==='time').reduce((sum,r)=>sum+(Number(r.data.hours)||0),0),recent:all.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,8)};},
  drafts(id){get(id);return db.prepare('SELECT * FROM drafts WHERE record_id=? ORDER BY created_at DESC').all(id);},
  addDraft(id,result){const r=get(id),draft={id:randomUUID(),record_id:id,content:result.content,model:result.model||'',created_at:new Date().toISOString()};db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?)').run(...Object.values(draft));log('AI draft saved',r);return draft;},
  attachments(id){get(id);return db.prepare('SELECT id,record_id,name,type,length(content) AS size,created_at FROM attachments WHERE record_id=?').all(id);},
  addAttachment(id,input){const r=get(id);if(typeof input.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw new WorkspaceError('Invalid file.');const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>2*1024*1024)throw new WorkspaceError('Files must be between 1 byte and 2 MB.');const allowed=['application/pdf','text/plain','image/png','image/jpeg'];if(!allowed.includes(input.type))throw new WorkspaceError('Choose a PDF, text, PNG or JPEG file.');const name=path.basename(String(input.name||'attachment')).replace(/[\r\n"\\]/g,'_').slice(0,150);const uid=randomUUID();db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?)').run(uid,id,name,input.type,bytes,new Date().toISOString());log('file attached',r);return {id:uid,name};},
  attachment(id){const a=db.prepare('SELECT * FROM attachments WHERE id=?').get(id);if(!a)throw new WorkspaceError('File not found.',404);return a;},
  close(){db.close();}
 };return api;
}
export function exportCSV(feature,records){
 const keys=['title','status','practice_area','matter_id','client_id',...feature.fields.map(f=>f.name),'notes'];
 const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return [keys.map(cell).join(','),...records.map(r=>keys.map(k=>cell(r[k]??r.data[k])).join(','))].join('\r\n');
}
