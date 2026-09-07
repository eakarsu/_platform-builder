const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require(process.env.TYPESCRIPT_MODULE||'/Users/erolakarsu/projects/smallLawFirm/node_modules/typescript');
const root=path.resolve(__dirname,'../..'),build=path.resolve(__dirname,'..');
const inventory=JSON.parse(fs.readFileSync(path.join(build,'reports/inventory.json'))),groups=JSON.parse(fs.readFileSync(path.join(build,'reports/build-manifest.json'))),selected=new Set(groups.flatMap(g=>g.sources));
const result=[];
for(const app of inventory.filter(a=>selected.has(a.project))){
 const candidates=new Map(),definitions=[],seen=new Set();
 for(const f of app.evidenceFiles)if(/\.[cm]?[jt]sx?$|\.json$/.test(f.path)&&!f.path.endsWith('package.json'))candidates.set(f.path,true);
 for(const f of app.pageNames||[])if(/(?:AI|Tools|Feature|Center|Config|Page|\.tsx$)/i.test(f))candidates.set(f,true);
 for(const sub of ['app.config.mjs','domain-config.mjs','src/config/app.ts','src/config/record-metadata.json','frontend/src/config/features.js','frontend/src/config/features.ts','frontend/src/config/features.jsx'])if(fs.existsSync(path.join(root,app.project,sub)))candidates.set(sub,true);
 const proofs=[];
 for(const file of candidates.keys()){
  const full=path.join(root,app.project,file);let source;try{if(fs.statSync(full).size>1000000)continue;source=fs.readFileSync(full,'utf8');}catch{continue;}
  if(/sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{32,}/.test(source))continue;
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.json')?ts.ScriptKind.JSON:ts.ScriptKind.TSX),vars=new Map();
  function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)vars.set(n.name.text,n.initializer);ts.forEachChild(n,collect)}collect(ast);
  const resolving=new Set();
  function value(n,depth=0){
   if(!n||depth>18)return;
   if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isNumericLiteral(n))return Number(n.text);
   if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
   if(ts.isAsExpression(n)||ts.isSatisfiesExpression(n)||ts.isParenthesizedExpression(n))return value(n.expression,depth+1);
   if(ts.isIdentifier(n)&&vars.has(n.text)&&!resolving.has(n.text)){resolving.add(n.text);const v=value(vars.get(n.text),depth+1);resolving.delete(n.text);return v;}
   if(ts.isArrayLiteralExpression(n))return n.elements.map(e=>value(e,depth+1)).filter(x=>x!==undefined);
   if(ts.isObjectLiteralExpression(n)){const out={};for(const p of n.properties){if(ts.isPropertyAssignment(p)){const key=p.name.text??p.name.getText(ast);const v=value(p.initializer,depth+1);if(v!==undefined)out[key]=v;}else if(ts.isSpreadAssignment(p))Object.assign(out,value(p.expression,depth+1)||{});}return out;}
   if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)){
    const name=n.expression.text,args=n.arguments.map(a=>value(a,depth+1));
    if(name==='s')return args;
    if(name==='feature'&&typeof args[0]==='string'&&typeof args[2]==='string'&&Array.isArray(args[5]))return {id:args[0],title:args[2],description:args[3],outcome:args[4],fields:args[5].filter(Array.isArray).map(f=>({name:f[0],label:f[1],type:f[2],sample:f[3],options:f[4],required:true})),sourceCalculation:true,...args[6]};
    if(name==='defineApp')return {...args[0],features:args[1]};
   }
  }
  let meta={};function exportWalk(n){if(ts.isExportAssignment(n)){const v=value(n.expression);if(v&&v.features)meta=v;}ts.forEachChild(n,exportWalk)}exportWalk(ast);
  function harvest(obj,label,depth=0){
   if(depth>7||!obj)return;
   if(Array.isArray(obj)){for(const item of obj)harvest(item,label,depth+1);return;}
   if(typeof obj!=='object')return;
   const title=obj.title||obj.label||obj.name;
   if(typeof title==='string'&&(Array.isArray(obj.fields)||obj.endpoint||obj.path||obj.href||obj.slug||obj.id)&&title.length<170){
    const key=obj.id||obj.slug||obj.endpoint||obj.path||obj.href||obj.name||title;
    if(typeof key==='string'&&!['url','text','name','title','email','password'].includes(key)&&!obj.type&&!obj.kind){
     const entry={key,title,description:obj.description||'',fields:obj.fields||[],ai:/ai|tool|workflow/i.test(label)||obj.ai===true,source:app.project+'/'+file,line:1,definition:label,calculation:obj.sourceCalculation?{config:{engine:meta.engine,calculation:meta.calculation,currency:meta.currency||'USD'},feature:{...obj,fields:obj.fields.map(f=>({...f,key:f.name}))},sourceEngine:app.project+'/backend/recovery-domain.mjs'}:undefined};
     const sig=JSON.stringify([entry.key,entry.title,entry.fields]);if(!seen.has(sig)){seen.add(sig);definitions.push(entry);}
    }
   }
   for(const [k,v] of Object.entries(obj))if(!['fields','examples','samples','scenarios','options','data','columns','sample','schema'].includes(k))harvest(v,k,depth+1);
  }
  for(const [name,n] of vars)if(/feature|tool|page|nav|entit|capabilit|workflow/i.test(name))harvest(value(n),name);
  if(meta.features)harvest(meta.features,'features');
  proofs.push({path:app.project+'/'+file,sha256:crypto.createHash('sha256').update(source).digest('hex')});
 }
 result.push({project:app.project,definitions,proofs,routes:app.routes,pages:app.pageNames||[],entities:app.entities});
}
fs.writeFileSync(path.join(build,'reports/extracted-features.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({projects:result.length,structuredDefinitions:result.reduce((n,a)=>n+a.definitions.length,0),evidenceFiles:result.reduce((n,a)=>n+a.proofs.length,0),withoutDefinitions:result.filter(a=>!a.definitions.length).length}));
