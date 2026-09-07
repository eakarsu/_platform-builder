from pathlib import Path
import json,re,hashlib,collections,shutil
B=Path(__file__).resolve().parent.parent;ROOT=B.parent
plans=json.loads((B/'reports/build-manifest.json').read_text());extracted={a['project']:a for a in json.loads((B/'reports/extracted-features.json').read_text())}
def slug(s):
 s=re.sub(r'([a-z0-9])([A-Z])',r'\1-\2',str(s));return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def label(s):
 s=re.sub(r'([a-z0-9])([A-Z])',r'\1 \2',s);s=re.sub(r'^(?:AI|Ai|ai)[ _-]?','',s);return re.sub(r'[-_]+',' ',s).strip().capitalize()
common={
'clients':('Clients & customers','full_name email phone organization address'),'matters':('Work items & projects','reference jurisdiction due_date owner'), 'contacts':('Contacts & parties','full_name email phone organization relationship'),'tasks':('Tasks','assignee due_date priority'),'calendar':('Calendar','event_date location attendees'),'deadlines':('Deadlines & reminders','due_date owner requirements'),'notes':('Notes','content'),'documents':('Documents','document_type content'),'templates':('Templates','document_type content'),'billing':('Invoices & billing','invoice_number amount due_date payment_status'),'time':('Time tracking','work_date hours rate'),'messages':('Messages & communications','recipient subject content'),'reports':('Reports & analytics',''),'audit':('Activity & audit trail',''),'connections':('Provider connections','provider_name endpoint_url purpose')}
aliases={'customers':'clients','client':'clients','customer':'clients','case':'matters','cases':'matters','matter':'matters','projects':'matters','project':'matters','parties':'contacts','contact':'contacts','task':'tasks','events':'calendar','calendar-events':'calendar','appointments-calendar':'calendar','deadline':'deadlines','reminders':'deadlines','case-notes':'notes','files':'documents','uploads':'documents','document':'documents','template':'templates','invoices':'billing','invoice':'billing','billing-invoices':'billing','timesheets':'time','time-entries':'time','communications':'messages','notifications':'messages','analytics':'reports','reporting':'reports','audit-log':'audit','audit-logs':'audit','activity':'audit','activity-log':'audit','integrations':'connections'}
ignore={'','home','dashboard','overview','login','register','signup','sign-up','logout','forgot-password','reset-password','profile','settings','preferences','account','accounts-settings','privacy','terms','pricing','landing','about','help','search','features','feature','ai','ai-tools','ai-center','ai-custom','ai-advanced','advanced-ai','custom','ai-tools-custom','custom-views','codex-custom-viz','codex-operations','insights-timeline','registers','workflow','delivery','operations','batch03','extensions','config','status','health','history','list','test','sample-data','workbench'}
legal=json.loads(Path('/Users/erolakarsu/projects/legal-platform/config/merged-features.json').read_text());lm={m['id']:m['sourceProject'] for m in json.loads(Path('/Users/erolakarsu/projects/legal-platform/config/modules.json').read_text())}
def field(raw):
 if isinstance(raw,str):raw={'name':raw}
 if not isinstance(raw,dict):return
 name=raw.get('name') or raw.get('key') or raw.get('id')
 if not isinstance(name,str) or not re.match(r'^[A-Za-z][A-Za-z0-9_]*$',name):return
 if name in ['id','title','status','notes','user_id','userId','client_id','clientId','customer_id','customerId','case_id','caseId','matter_id','matterId','created_at','updated_at','createdAt','updatedAt','password','secret','api_key','apiKey','token','access_info']:return
 typ=raw.get('type') or raw.get('kind') or 'text'
 if typ in ['currency','integer','float','decimal','money','numeric']:typ='number'
 if typ in ['boolean','bool','checkbox']:typ='select';raw={**raw,'options':['true','false']}
 if typ in ['datetime','datetime-local','DateTime']:typ='date'
 if typ not in ['text','textarea','select','date','number','email','reference']:typ='text'
 if typ=='text' and re.search(r'content|description|details|instructions|facts|text|question|terms|context|evidence',name,re.I):typ='textarea'
 if typ=='text' and re.search(r'(?:_date|Date)$',name):typ='date'
 if typ=='text' and re.search(r'amount|hours|percentage|percent|balance|cost|price',name,re.I):typ='number'
 opts=raw.get('options')
 if not isinstance(opts,list):opts=[]
 opts=[str(x if isinstance(x,(str,int,float)) else x.get('value','')) for x in opts if isinstance(x,(str,int,float,dict))]
 if typ=='select' and not opts:typ='text'
 out={'name':name,'label':str(raw.get('label') or label(name)),'type':typ}
 if opts:out['options']=list(dict.fromkeys(opts))
 if raw.get('required'):out['required']=True
 return out

def normalized(key,title):
 k=slug(key.strip('/').replace('/api/','/'))
 for prefix in ['ai-tools-','ai-','cf-','gap-no-','gap-','cf-']:
  if k.startswith(prefix):k=k[len(prefix):]
 if k in aliases:k=aliases[k]
 # Exact semantic equivalents only; preserve domain-specific nouns and calculations.
 if k in common:return k
 t=slug(title)
 if t in aliases:return aliases[t]
 if t in common:return t
 k=re.sub(r'-(?:page|stateless)$','',k)
 return k or t
summaries=[]
for num,plan in enumerate(plans):
 target=ROOT/plan['id'];target.mkdir(exist_ok=True)
 for folder in ['config','reports','scripts','data']:(target/folder).mkdir(exist_ok=True)
 features={};mapped=[];ignored=[];warnings=[]
 if plan['id']=='legal-platform':
  for f in legal:
   f=json.loads(json.dumps(f));f['sources']=[{**s,'module':lm.get(s['module'],s['module']),'source':str(Path('/Users/erolakarsu/projects/legal-platform')/s['source'])} for s in f['sources']];f['owner']=lm.get(f['owner'],f['owner']);features[f['id']]=f
 else:
  for id,(title,fields) in common.items():
   features[id]=dict(id=id,title=title,group='Workspace',description=f'Organize {title.lower()} and track progress.',fields=[x for r in fields.split() if (x:=field(r))],ai=id in ['documents','templates','notes'],mode='report' if id=='reports' else 'audit' if id=='audit' else 'integration' if id=='connections' else 'records',sources=[],owner='workspace',alternatives=[],path='/features/'+id)
 locked=set(features) if plan['id']=='legal-platform' else set()
 titles={slug(f['title']):id for id,f in features.items()};localmaps={};engines={}
 def include(project,key,title,fields,source,kind,ai=False,description='',calc=None):
  rawkey=key.strip('/');k=slug(rawkey)
  if k in ignore or rawkey.startswith(('auth/','settings/')):
   ignored.append(dict(project=project,key=key,source=source,reason='Authentication, configuration, container or utility represented by the shared workspace.'));return
  if not title or len(title)>170:return
  curated=next((f['id'] for f in features.values() if any(s['module']==project and (s['path'].strip('/#')==rawkey or s.get('label')==title) for s in f['sources'])),None) if plan['id']=='legal-platform' else None
  id=curated or normalized(key,title)
  if not id or len(id)>145:id=(id[:115]+'-'+hashlib.sha256(key.encode()).hexdigest()[:10])
  id=titles.get(slug(title),id)
  ref=dict(module=project,path=key,source=source,kind=kind,label=title)
  if id not in features:
   integration=bool(re.search(r'integration|connector|webhook|api-connection|esign|e-signature|sms-delivery|payment-processing|live-provider',id))
   features[id]=dict(id=id,title=title,group=label(project),description=description or f'Organize {title.lower()} and prepare the next review.',fields=[],ai=bool(ai),mode='integration' if integration else 'records',sources=[],owner=project,alternatives=[],path='/features/'+id)
   titles[slug(title)]=id
  f=features[id];f['sources'].append(ref);localmaps.setdefault(project,{})[key.strip('/')]=id
  if id not in locked:
   existing={x['name']:x for x in f['fields']}
   for raw in fields:
    x=field(raw)
    if not x:continue
    if x['name'] in existing:
     old=existing[x['name']]
     if old['type']==x['type']=='select':old['options']=list(dict.fromkeys(old.get('options',[])+x.get('options',[])))
     if old['type']!=x['type']:warnings.append(dict(feature=id,field=x['name'],reason='Conflicting source field types retained in source map; native field keeps first definition.'))
    else:existing[x['name']]=x
   f['fields']=list(existing.values())
   f['ai']=f['ai'] or ai
  if calc and f['mode']=='records':
   engine=ROOT/calc['sourceEngine']
   if engine.exists():
    code=engine.read_text()
    if 'export function calculate(' in code and not re.search(r'\b(?:import|require|fetch|process|eval|globalThis)\b',code):
     digest=hashlib.sha256(code.encode()).hexdigest();engines[digest]=dict(source=str(engine),sha256=digest)
     # Preserve the source feature ID and exact source input keys for each calculation variant.
     f.setdefault('calculations',[]).append(dict(id=slug(project+'-'+key),engine=digest,config=calc['config'],feature=calc['feature'],project=project))
   else:warnings.append(dict(feature=id,reason='Source calculation module missing; native records/drafts only.'))
  mapped.append(dict(project=project,sourceKey=key,source=source,canonical=id,kind=kind))
 for project in plan['sources']:
  app=extracted[project]
  for d in app['definitions']:
   include(project,d['key'],d['title'],d['fields'],str(ROOT/d['source']),'definition',bool(d['ai'] or d.get('calculation') or re.search(r'analy|review|draft|predict|forecast|recommend|assess',d['title'],re.I)),d['description'],d.get('calculation'))
   if d.get('mode')=='integration' and (dest:=localmaps.get(project,{}).get(d['key'].strip('/'))):features[dest]['mode']='integration';features[dest]['ai']=False
  for route in app['routes']:
   key=route.strip('/');parts=key.split('/')
   if '*' in key or not key or re.search(r'[:\[\]]',key) or parts[-1] in ['new','edit','create']:
    ignored.append(dict(project=project,key=route,reason='Home, dynamic record action, callback or fallback route.'));continue
   if key in localmaps.get(project,{}):continue
   # Existing mapped source routes retain their curated Legal Platform destinations.
   matched=next((f for f in features.values() if any(s['module']==project and s['path'].strip('/')==key for s in f['sources'])),None)
   if matched:mapped.append(dict(project=project,sourceKey=route,canonical=matched['id'],kind='route'));continue
   title=label(parts[-1]);title=re.sub(r'^(?:Cf |Gap no |Gap )','',title,flags=re.I)
   include(project,key,title,[],str(ROOT/project),'route',bool(re.search(r'ai|analy|review|draft|predict|forecast|recommend|assess',key)))
  if not app['definitions'] and not app['routes']:
   # Keep an explicit source-backed domain record for native schema/CLI applications; no runtime-parity claim.
   for entity in app['entities']:
    if slug(entity) in ['user','session','account','verification-token']:continue
    include(project,entity,label(entity),[],str(ROOT/project),'schema')
   if not app['entities']:
    include(project,project,label(project)+' work',[],str(ROOT/project),'source-workflow',True)
    warnings.append(dict(project=project,reason='No structured web feature declarations extracted. Source-specific engine/UI migration remains required.'))
 # Stable schema, status boundaries and source variants.
 for f in features.values():
  if not f['fields'] and f['mode'] not in ['report','audit']:f['fields']=[dict(name='details',label='Details',type='textarea'),dict(name='source_text',label='Source evidence',type='textarea'),dict(name='due_date',label='Review date',type='date')]
  if f['id'] not in locked:
   # Required fields differ between source variants: preserve source validation in calculator adapters;
   # allow draft records to be saved with missing inputs rather than requiring unrelated variant fields.
   for x in f['fields']:x.pop('required',None)
  if f['mode']!='records':f['ai']=False
  f['sources']=list({json.dumps(s,sort_keys=True):s for s in f['sources']}.values())
  f['implementation']='Native records, linked work, exports, attachments and review drafts'+('; source calculation adapters' if f.get('calculations') else '')
  if f['mode']=='integration':f['description']='Prepare '+f['title'].lower()+' requests and track review. Provider execution is not connected.'
  if f.get('calculations'):f['calculations']=list({c['id']:c for c in f['calculations']}.values())
 config={**plan,'port':46000+num,'title':plan['title'],'productName':plan['title'].split(' & ')[0]+' Workspace','runtimeVersion':'1.0.0','sourceRoots':[str(ROOT/s) for s in plan['sources']]}
 modules=[dict(id=s,name=label(s),sourceProject=s,services=[]) for s in plan['sources']]
 for file,value in [('config/app.json',config),('config/merged-features.json',list(features.values())),('config/modules.json',modules),('reports/feature-map.json',dict(mapped=mapped,ignored=ignored,migrationWarnings=warnings)),('reports/engines.json',engines)]: (target/file).write_text(json.dumps(value,indent=2)+'\n')
 (target/'apps.txt').write_text('\n'.join(plan['sources'])+'\n')
 summaries.append(dict(id=plan['id'],sources=len(plan['sources']),features=len(features),mappedSourceEntries=len(mapped),ignoredEntries=len(ignored),calculationAdapters=sum(len(f.get('calculations',[])) for f in features.values()),migrationWarnings=len(warnings),port=config['port']))
(B/'reports/compiled-platforms.json').write_text(json.dumps(summaries,indent=2)+'\n')
print(json.dumps(dict(platforms=len(summaries),sources=sum(s['sources'] for s in summaries),features=sum(s['features'] for s in summaries),calculationAdapters=sum(s['calculationAdapters'] for s in summaries),largest=max(summaries,key=lambda s:s['features'])),indent=2))
