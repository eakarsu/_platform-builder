const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Volumes/external/projects/homeservices/node_modules/@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const builder=path.resolve(__dirname,'..'),root=path.dirname(builder);
(async()=>{
 const plans=JSON.parse(await fs.readFile(path.join(builder,'reports/build-manifest.json'))),browser=await chromium.launch({headless:true}),results=process.env.PLATFORMS?JSON.parse(await fs.readFile(path.join(builder,'reports/browser-results.json'))).filter(r=>!process.env.PLATFORMS.split(',').includes(r.id)):[];let next=0;
 async function worker(){while(next<plans.length){const index=next++,plan=plans[index],dir=path.join(root,plan.id);if(process.env.PLATFORMS&&!process.env.PLATFORMS.split(',').includes(plan.id))continue;let server,context,temp;
  try{
   const load=rel=>import(pathToFileURL(path.join(dir,'dist',rel))),{createHub}=await load('hub/server.mjs'),{openStore}=await load('hub/runtime/store.mjs'),{seedWorkspace}=await load('scripts/seed.mjs'),{features,assistants}=await load('scripts/workspace.mjs');
   temp=await fs.mkdtemp(path.join(os.tmpdir(),'platform-browser-'));const databasePath=path.join(temp,'test.sqlite'),store=openStore(databasePath,features);seedWorkspace(store);store.close();
   server=createHub({databasePath});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
   context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.getByRole('heading',{name:'Everything in one place.',exact:true}).waitFor();assert.equal(await page.locator('a.feature-link').count(),features.filter(f=>!f.ai).length+assistants.length);
   await page.screenshot({path:path.join(dir,'reports/desktop.png')});
   for(const f of features){
    await page.evaluate(url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));},f.path);
    await page.getByRole('heading',{name:f.ai?assistants.find(a=>a.featureIds.includes(f.id)).title:f.title,exact:true}).waitFor();
    if(f.mode==='report'){await page.locator('.chart-row').first().waitFor();assert.ok(await page.locator('.chart-row').count()>=15);}
    else if(f.mode==='audit'){await page.locator('.settings-row').first().waitFor();assert.ok(await page.locator('.settings-row').count()>=15);}
    else if(f.ai){await page.locator('.question-input').waitFor();assert.equal(await page.locator('#content > .panel table').count(),0,f.id);}
    else{await page.locator(`tbody a[href^="${f.path}?record="]`).first().waitFor();assert.equal(await page.locator('tbody tr').count(),15,f.id);}
    assert.equal(await page.locator('#error').isVisible(),false,f.id);
   }
   await page.goto(base+'/features/clients');await page.locator('tbody tr').first().waitFor();await page.getByRole('button',{name:'+ New record',exact:true}).click();await page.locator('#record-dialog[open]').waitFor();await page.locator('[name="title"]').fill('Browser verification client');if(await page.locator('[name="data.full_name"]').count())await page.locator('[name="data.full_name"]').fill('Browser Client');await page.getByRole('button',{name:'Save record',exact:true}).click();await page.getByRole('heading',{name:'Browser verification client',exact:true}).waitFor();
   await page.getByRole('button',{name:'Edit record',exact:true}).click();await page.locator('[name="title"]').fill('Updated browser client');await page.getByRole('button',{name:'Save record',exact:true}).click();await page.getByRole('heading',{name:'Updated browser client',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Updated browser client',exact:true}).waitFor();
   await page.setViewportSize({width:390,height:844});await page.goto(base);await page.getByRole('heading',{name:'Everything in one place.',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');await page.screenshot({path:path.join(dir,'reports/mobile.png')});
   await page.getByRole('button',{name:'Toggle feature navigation'}).click();await page.locator('#nav-search').fill('Documents');await page.locator('a.feature-link[href="'+assistants.find(a=>a.featureIds.includes('documents')).path+'"]').click();await page.getByRole('heading',{name:assistants.find(a=>a.featureIds.includes('documents')).title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.body.classList.contains('menu-open')),false);assert.deepEqual(errors,[]);
   const report={id:plan.id,status:'passed',pagesVisited:features.length,minimumRows:15,browserCRUD:true,persistence:true,mobile:true,pageErrors:errors,verifiedAt:new Date().toISOString()};await fs.writeFile(path.join(dir,'reports/browser-verification.json'),JSON.stringify(report,null,2));results.push(report);console.log(`${results.length}/64 browser passed: ${plan.id} (${features.length} pages)`);
  }catch(e){results.push({id:plan.id,status:'failed',error:e.stack});console.log(`FAILED ${plan.id}: ${e.message}`);}
  finally{if(context)await context.close();if(server)await new Promise(resolve=>server.close(resolve));if(temp)await fs.rm(temp,{recursive:true,force:true});await fs.writeFile(path.join(builder,'reports/browser-results.json'),JSON.stringify(results,null,2));}
 }}
 try{await Promise.all(Array.from({length:4},worker));}finally{await browser.close();}
 if(results.some(r=>r.status==='failed'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
