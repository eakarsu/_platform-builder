from pathlib import Path
import json,re
B=Path(__file__).resolve().parent.parent;ROOT=B.parent
plans=json.loads((B/'reports/build-manifest.json').read_text())
def is_ai(f):return f['mode'] not in ['report','audit'] and (f['ai'] or re.search(r'\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b',f['title'],re.I))
for p in plans:
 root=ROOT/p['id'];app=json.loads((root/'config/app.json').read_text());features=json.loads((root/'config/merged-features.json').read_text())
 (root/'package.json').write_text(json.dumps(dict(name=p['id'],version='1.0.0',private=True,type='module',engines={'node':'>=22.13'},scripts={'build':'node ../_platform-builder/scripts/build.mjs .','start':'./start.sh','seed':'node dist/scripts/seed.mjs','test':'node ../_platform-builder/scripts/verify-app.mjs .'}),indent=2)+'\n')
 (root/'start.sh').write_text('#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec node scripts/launch.mjs\n');(root/'start.sh').chmod(0o755)
 (root/'scripts/launch.mjs').write_text("""import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const app=JSON.parse(readFileSync(path.join(root,'config/app.json'))),port=Number(process.env.PORT||process.env.HUB_PORT||app.port);
if(!existsSync(path.join(root,'dist/hub/server.mjs'))){const {build}=await import('../../_platform-builder/scripts/build.mjs');await build(root);}
const {clearPorts}=await import('../dist/scripts/clear-ports.mjs');await clearPorts([port]);
if(process.env.SEED_DEMO_DATA!=='0'){const seeded=spawnSync(process.execPath,[path.join(root,'dist/scripts/seed.mjs')],{cwd:root,stdio:'inherit',env:process.env});if(seeded.status!==0)process.exit(seeded.status||1);}
const child=spawn(process.execPath,[path.join(root,'dist/hub/server.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,PORT:String(port)}});
const folder=path.join(root,'.runtime'),pidfile=path.join(folder,'process.json');mkdirSync(folder,{recursive:true});writeFileSync(pidfile,JSON.stringify({pid:child.pid,port,app:app.id}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('exit',code=>{try{if(JSON.parse(readFileSync(pidfile)).pid===child.pid)unlinkSync(pidfile);}catch{}process.exitCode=code||0;});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
""")
 (root/'.gitignore').write_text('dist/\n.build-*/\n.dist-previous/\nnode_modules/\n.env\n.env.*\n!.env.example\ndata/\n.runtime/\n*.log\n')
 (root/'.env.example').write_text(f'# Optional settings. No PostgreSQL setup is needed for the native workspace.\nPORT={app["port"]}\n# OPENROUTER_API_KEY=\n# OPENROUTER_MODEL=\n# SEED_DEMO_DATA=0\n')
 (root/'README.md').write_text(f'''# {p['title']}

Native local workspace for {p['buyer'].lower()}, assembled from **{len(p['sources'])} source candidates**. It has **{len(features)} canonical feature pages**, shared client/work-item records, domain fields, search, exports, attachments, audit history and optional AI review drafts.

```sh
cd /Users/erolakarsu/external/projects/{p['id']}
npm run build
./start.sh
```

Open http://localhost:{app['port']}. Node 22.13+ is required. No package installation or PostgreSQL database is needed. Startup clears only this selected port, tops up editable features to 15 fictional records and starts the app. Set `SEED_DEMO_DATA=0` to skip top-up. Configure your own OpenRouter key/model in `.env` to enable AI drafts; credentials are never imported from source projects.

Data is in `data/workspace.sqlite` and persists across builds and restarts. Source apps remain untouched in their original folders. The shared maintained source lives in `../_platform-builder/template`; the build creates this app's standalone `dist/` artifact.

See `FEATURE_STATUS.md` and the in-app Feature merge map for implementation boundaries. Source-backed calculation adapters are available only where explicitly registered; they use saved inputs and retain their original calculation scope. Other pages provide native records and drafts, not an automatic migration of every source engine.

```sh
npm test
npm run seed
```

This is a local single-user workspace. Original users/business databases, hosted authentication, multi-tenant permissions and external provider operations are not migrated. Do not treat a preparation record as a sent message, paid transaction, approved clinical decision or completed provider operation.
''')
 status=f'''# Feature status — {p['title']}

| Capability | Status |
| --- | --- |
| Native sidebar and canonical feature registry | Built; {len(features)} pages |
| Shared records, validation, relationships, persistence | Implemented in shared runtime |
| Clickable table rows with centered details popup | Implemented; Edit, Delete, Cancel, keyboard access and mobile layout |
| Domain field forms and source traceability | Imported from static source definitions; historical routes are labeled in mapping |
| CSV exports, attachments, audit and report totals | Implemented |
| At least 15 fictional rows per editable feature | Seeded by startup; measured in reports/seed-verification.json |
| AI question-and-answer workspace | Related capabilities share grouped assistants; combined questions, shared context, formatted answers and pooled history; live provider configuration required |
| Source calculation adapters | Available for explicitly registered calculation variants only |
| Source business-rule and state-machine parity | Incomplete beyond registered adapters and native records; verify each source journey |
| Original account/business data migration | Not performed; source data preserved |
| Provider integrations and external delivery | Not connected; request preparation only |
| Hosted authentication, independent-review roles and tenant isolation | Not migrated; local single-user boundary |

A successful build or populated table is not evidence of full source workflow parity. The source-to-feature map records every extracted definition and route, with explicit exclusions and migration warnings. Test/build reports distinguish checked behavior from remaining work.

| Canonical feature | Native mode | Source entries | Calculators | Status |
| --- | --- | ---: | ---: | --- |
'''
 for f in features:status+=f"| {f['title'].replace('|','/')} | {f['mode']} | {len(f['sources'])} | {len(f.get('calculations',[]))} | {'AI question-and-answer workspace; records available as context' if is_ai(f) else 'Provider request records only' if f['mode']=='integration' else 'Native records/view'} |\n"
 (root/'FEATURE_STATUS.md').write_text(status)
