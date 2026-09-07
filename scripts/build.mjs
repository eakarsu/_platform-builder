import {cp,mkdir,readFile,writeFile,rename,rm,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const builder=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function build(root){
 const app=JSON.parse(await readFile(path.join(root,'config/app.json'))),features=JSON.parse(await readFile(path.join(root,'config/merged-features.json')));
 const ids=new Set();for(const f of features){if(!/^[a-z0-9-]+$/.test(f.id)||ids.has(f.id)||f.path!='/features/'+f.id)throw new Error('Invalid feature registry: '+f.id);ids.add(f.id);if(new Set(f.fields.map(x=>x.name)).size!==f.fields.length)throw new Error('Duplicate field '+f.id);}
 for(const f of features)for(const field of f.fields.filter(x=>x.type==='reference'))if(!ids.has(field.reference))throw new Error('Unresolved reference '+f.id+'.'+field.name);
 const staging=path.join(root,'.build-'+process.pid);await mkdir(staging,{recursive:true});
 try{
  await cp(path.join(builder,'template'),staging,{recursive:true});await cp(path.join(root,'config'),path.join(staging,'config'),{recursive:true});await mkdir(path.join(staging,'engines'),{recursive:true});
  const engines=JSON.parse(await readFile(path.join(root,'reports/engines.json')));
  for(const [hash,e] of Object.entries(engines)){const bundled=path.join(root,'engines',hash+'.mjs');let source;try{source=await readFile(bundled);}catch(error){if(error.code!=='ENOENT')throw error;source=await readFile(e.source);}if(createHash('sha256').update(source).digest('hex')!==hash)throw new Error('Source engine changed: '+e.source);await writeFile(path.join(staging,'engines',hash+'.mjs'),source);}
  const index=path.join(staging,'hub/public/index.html');let markup=await readFile(index,'utf8');markup=markup.replaceAll('Legal Platform',html(app.productName)).replaceAll('ONE LEGAL WORKSPACE','ONE SHARED WORKSPACE').replaceAll('One workspace. Every practice area.','One workspace. Connected workflows.');await writeFile(index,markup);
  for(const file of ['hub/public/app.js','hub/public/assistant.js','hub/public/floating-assistant.js','hub/public/ai-limits.js','hub/runtime/assistant.mjs','hub/server.mjs','hub/runtime/store.mjs','hub/runtime/api.mjs','scripts/seed.mjs']){const result=spawnSync(process.execPath,['--check',path.join(staging,file)],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}
  const previous=path.join(root,'.dist-previous');await rm(previous,{recursive:true,force:true});try{await rename(path.join(root,'dist'),previous);}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await rename(staging,path.join(root,'dist'));}catch(e){try{await rename(previous,path.join(root,'dist'));}catch{}throw e;}await rm(previous,{recursive:true,force:true});
  const report={app:app.id,features:features.length,sourceApps:app.sources.length,calculatorEngines:Object.keys(engines).length,registryHash:createHash('sha256').update(JSON.stringify(features)).digest('hex'),builtAt:new Date().toISOString(),status:'built'};await writeFile(path.join(root,'reports/build.json'),JSON.stringify(report,null,2)+'\n');return report;
 }finally{await rm(staging,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await build(path.resolve(process.argv[2]||process.cwd()))));
