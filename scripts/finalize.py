from pathlib import Path
from datetime import datetime, timezone
import json, sqlite3
B=Path(__file__).resolve().parent.parent
ROOT=B.parent
R=B/'reports'
read=lambda p: json.loads(p.read_text())
write=lambda p,d: p.write_text(json.dumps(d,indent=2)+'\n')
plans=read(R/'build-manifest.json')
build={r['id']:r for r in read(R/'build-results.json')}
browser={r['id']:r for r in read(R/'browser-results.json')}
startup={r['id']:r for r in read(R/'startup-results.json')}
assert len(plans)==64 and len({p['id'] for p in plans})==64
sources=[s for p in plans for s in p['sources']]
assert len(sources)==815 and len(set(sources))==815
rows=[];unmapped=[];ports=set()
for p in plans:
 i=p['id'];root=ROOT/i
 app=read(root/'config/app.json');features=read(root/'config/merged-features.json')
 for name in ['app.json','merged-features.json','modules.json']:
  assert read(root/'config'/name)==read(root/'dist/config'/name),(i,name)
 assert app['port'] not in ports;ports.add(app['port'])
 assert set(app['sources'])==set(p['sources'])
 assert all(x[i]['status']=='passed' for x in [build,browser,startup]),i
 assert build[i]['built']['features']==len(features)==browser[i]['pagesVisited'],i
 assert {k:v for k,v in read(root/'reports/build.json').items() if k!='builtAt'}=={k:v for k,v in build[i]['built'].items() if k!='builtAt'},i
 with sqlite3.connect(f'file:{root}/data/workspace.sqlite?mode=rw',uri=True) as db:
  counts=dict(db.execute('select feature,count(*) from records group by feature'))
 editable=[f for f in features if f['mode'] not in ['report','audit']]
 minimum=min(counts.get(f['id'],0) for f in editable)
 assert minimum>=15,(i,minimum)
 mapping=read(root/'reports/feature-map.json')
 mapped={m['project'] for m in mapping['mapped']}
 unmapped.extend({'platform':i,'source':s,'status':'No native capability mapped; source review required'} for s in p['sources'] if s not in mapped)
 row=dict(id=i,title=p['title'],port=app['port'],sources=len(p['sources']),featurePages=len(features),editableTables=len(editable),minimumRows=minimum,seedRows=sum(counts.get(f['id'],0) for f in editable),build='passed',api='passed',browser='passed',startup='passed',calculationsExecuted=build[i]['verified']['sourceCalculationsExecuted'])
 rows.append(row)
 marker='\n## Verified local build\n'
 status=(root/'FEATURE_STATUS.md').read_text().split(marker)[0]
 popup_report=root/'reports/row-popup-verification.json'
 if popup_report.exists():
  popup=read(popup_report);assert popup['status']=='passed',i
  row['rowPopup']='passed'
  if '| Clickable table rows with centered details popup |' not in status:
   status=status.replace('| Shared records, validation, relationships, persistence | Implemented in shared runtime |','| Shared records, validation, relationships, persistence | Implemented in shared runtime |\n| Clickable table rows with centered details popup | Implemented; Edit, Delete, Cancel, keyboard access and mobile layout |')
 if popup_report.exists() and 'Row popup verification passed:' not in status:
  status+='\nRow popup verification passed: dashboard and feature rows, keyboard/focus, editing and persistence, delete confirmation/cancellation, centered mobile layout and full-record navigation. See `reports/row-popup-verification.json`.\n'
 status+=marker+f"\nBuild, API, browser and actual `start.sh` checks passed. All {len(features):,} feature pages were visited in the browser; {len(editable):,} editable tables contain at least {minimum} fictional rows each. CRUD persistence and mobile layout were checked. Evidence is in `reports/verification.json`, `reports/browser-verification.json` and `reports/startup-verification.json`.\n\nThese checks cover the native local workspace. Full source-specific business rules, authentication and live provider operations remain incomplete as described above. Test servers were stopped after verification.\n"
 (root/'FEATURE_STATUS.md').write_text(status)
 p['status']='local workspace built and verified'
 p['canonicalFeatureStatus']='Native feature records and registered calculators built; complete source workflow and provider migration remains incomplete.'
write(R/'build-manifest.json',plans)
write(R/'sources-needing-manual-migration.json',unmapped)
assert not unmapped,unmapped
summary=dict(verifiedAt=datetime.now(timezone.utc).isoformat(),status='passed',apps=len(rows),sourceCandidates=len(sources),featurePages=sum(r['featurePages'] for r in rows),editableTables=sum(r['editableTables'] for r in rows),seedRows=sum(r['seedRows'] for r in rows),calculationAdaptersExecuted=sum(r['calculationsExecuted'] for r in rows),sourcesWithoutNativeMapping=len(unmapped),scope='Local workspace builds; not full source business workflow or production integration parity',results=rows)
write(R/'final-verification.json',summary)
report=f'''# Built platform index

Created and built **{len(rows)} merged local workspace apps**, covering **{len(sources)} source candidates**, in `/Users/erolakarsu/external/projects` (the same location as `/Volumes/external/projects`). Original source projects and their business data were preserved.

All 64 passed build, API, browser and actual `start.sh` checks. The browser checks visited {summary['featurePages']:,} native feature pages, tested record creation/editing and persistence, and checked mobile navigation/layout. All {summary['editableTables']:,} editable tables currently have at least 15 fictional rows, totaling {summary['seedRows']:,} rows. The API checks executed {summary['calculationAdaptersExecuted']} registered source calculation adapters. Servers started for verification were stopped afterward.

## Run an app

```sh
cd /Users/erolakarsu/external/projects/beauty-platform
./start.sh
```

Open the matching URL below. Node 22.13+ is required. Each app is a local single-user workspace and has no login step. Startup clears its selected port before starting and seeds any tables below 15 rows. `PORT=47000 ./start.sh` selects a different port; `SEED_DEMO_DATA=0 ./start.sh` skips sample-data top-up. Data persists in that app's `data/workspace.sqlite`.

## Implementation boundary

Shared record management, validation, relationships, attachments, CSV export, audit, aggregates and optional AI draft transport are implemented. Common features are merged into canonical sidebar pages with source mappings. Registered source calculators preserve their explicitly tested scope. Live AI needs your own provider configuration.

These are functioning local workspace builds, not completed migrations of every source's specialized business logic. Source state machines, multi-user authentication/roles, independent reviews and live provider actions still require implementation and validation. Integration pages prepare request records; they do not send or execute them. Each app's `FEATURE_STATUS.md` documents that boundary.

The new external `legal-platform` is separate from `/Users/erolakarsu/projects/legal-platform`; old users and business records were not migrated. Source review also moved `financialServices_salesforce` to `sales-platform` because its implemented workflow is governed CRM/outreach.

## Apps

| # | Folder / feature status | Local URL | Sources | Feature pages | Sample rows | Build / API / browser / startup |
| ---: | --- | --- | ---: | ---: | ---: | --- |
'''
for n,r in enumerate(rows,1):
 report+=f"| {n} | [{r['id']}](./{r['id']}/FEATURE_STATUS.md) | [localhost:{r['port']}](http://localhost:{r['port']}) | {r['sources']} | {r['featurePages']} | {r['seedRows']} | Passed / passed / passed / passed |\n"
if all(r.get('rowPopup')=='passed' for r in rows):
 report+='\nAll 64 row-popup browser checks passed: centered details with Edit, Delete and Cancel, keyboard/focus, persistent saves/deletes and mobile layout. Evidence: [_platform-builder/reports/row-popup-results.json](./_platform-builder/reports/row-popup-results.json).\n'
report+='\nMaintained code and regeneration instructions: [_platform-builder/README.md](./_platform-builder/README.md). Machine-readable evidence: [final-verification.json](./_platform-builder/reports/final-verification.json). Per-app reports include desktop/mobile screenshots and measured check results.\n'
(ROOT/'PLATFORM_BUILD_REPORT.md').write_text(report)
print(json.dumps({k:v for k,v in summary.items() if k!='results'},indent=2))
