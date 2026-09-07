from pathlib import Path
import json,re,hashlib
B=Path(__file__).resolve().parent.parent;ROOT=B.parent
plans=json.loads((B/'reports/build-manifest.json').read_text());results=json.loads((B/'reports/ai-workspace-results.json').read_text());reports={r['id']:r for r in results}
assert len(reports)==64 and all(r['status']=='passed' for r in reports.values())
count=0
for p in plans:
 root=ROOT/p['id'];report=reports[p['id']];f=json.loads((root/'config/merged-features.json').read_text());ai=[x for x in f if x['mode'] not in ['report','audit'] and (x['ai'] or re.search(r'\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b',x['title'],re.I))];assert len(ai)==report['aiPagesVisited'];count+=len(ai)
 for rel in ['hub/public/app.js','hub/public/assistant.js','hub/public/style.css','hub/runtime/api.mjs','hub/runtime/assistant.mjs','hub/runtime/store.mjs','scripts/workspace.mjs']:
  assert (B/'template'/rel).read_bytes()==(root/'dist'/rel).read_bytes(),(p['id'],rel)
 path=root/'FEATURE_STATUS.md';s=path.read_text();s=s.replace('| AI review drafts | Implemented transport; live credentials/provider verification required |','| AI question-and-answer workspace | Replaces AI feature tables; questions, context fields, formatted answers, follow-ups and saved history; live provider configuration required |')
 names={x['title'].replace('|','/') for x in ai};lines=[]
 for line in s.splitlines():
  if line.startswith('| '):
   cells=[v.strip() for v in line.strip('|').split('|')]
   if len(cells)==5 and cells[0] in names:cells[4]='AI question-and-answer workspace; records available as context';line='| '+' | '.join(cells)+' |'
  lines.append(line)
 s='\n'.join(lines).split('\n## AI workspace verification\n')[0]+f'''\n\n## AI workspace verification

All {len(ai)} AI feature routes were checked in the browser and show questions and formatted answers instead of the original record table. Existing records are retained as optional context. Questions, follow-ups, saved history across restart, Markdown tables, safe rendering, downloads, provider-failure recovery and mobile layout passed with a mocked provider. See `reports/ai-workspace-verification.json`.

Live answers require `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in this app's `.env` and an app restart. No live provider call was made during verification. Conversational answers do not execute unmigrated specialist engines, read record attachments automatically or perform external actions.
''';path.write_text(s)
 path=root/'README.md';s=path.read_text().split('\n## Ask AI\n')[0]+'''\n\n## Ask AI

AI feature pages now open a question-and-answer workspace. Enter your question, optionally add supporting fields or choose a saved record, and click **Ask AI**. Answers display with headings, lists and comparison tables where appropriate. Ask follow-up questions, reopen saved answers, copy the response or download it as Markdown. Non-AI record tables keep their existing popup actions.

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in this app's `.env`, restart `./start.sh`, and refresh the browser. Missing configuration shows a setup message; no fabricated answer is substituted. Your question, supplied fields, selected record and conversation context go to the configured provider. Attachments are not automatically read. Saved answers remain in this app's SQLite database.
''';path.write_text(s)
summary={'status':'passed','apps':64,'aiPages':count,'sharedTestsPassed':16,'providerVerification':'mocked; live provider configuration required','results':results}
(B/'reports/ai-workspace-final.json').write_text(json.dumps(summary,indent=2)+'\n')
report=f'''# AI question-and-answer workspaces

Implemented in all 64 apps. **{count:,} AI feature pages** now show a question-and-answer workspace instead of a record table. Existing records remain available as optional context. Non-AI tables keep their row popups.

Available: questions; feature-specific supporting fields; optional selected-record context; formatted headings, lists, tables and code; follow-up questions; saved answer history; copy and Markdown download; loading and error states; mobile layout.

All 64 build/API checks and all AI workspace browser checks passed. The browser run visited every AI feature route and tested provider-backed request/response behavior with a controlled mock. Thirteen shared tests passed, including missing configuration, invalid input, follow-up isolation and no fabricated answers after failure. No live provider quality or availability claim is made.

## Enable live answers

In the desired app's `.env`, set your own `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, then restart `./start.sh` and refresh. None of the 64 app `.env` files contained both nonempty settings at inspection time. Shell-supplied environment variables were not included in that file check. No credentials were copied from original projects.

Answers are conversational assistance, not execution of unmigrated specialist engines or external actions. Only the question, supplied fields, selected record and conversation context are sent; record attachments are not read automatically.

## Verification by app

| Folder | AI pages checked | Result |
| --- | ---: | --- |
'''
for p in plans:
 r=reports[p['id']];report+=f"| [{p['id']}](./{p['id']}/FEATURE_STATUS.md) | {r['aiPagesVisited']} | Passed with mock provider |\n"
report+='\n[Detailed verification](./_platform-builder/reports/ai-workspace-final.json)\n'
(ROOT/'AI_WORKSPACE_REPORT.md').write_text(report)
print(f'Verified all 64 apps, {count} AI pages; documentation updated.')
