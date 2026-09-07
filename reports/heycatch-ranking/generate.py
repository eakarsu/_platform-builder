from pathlib import Path
import json,hashlib
from datetime import datetime,timezone
R=Path(__file__).resolve().parent; B=R.parent.parent; ROOT=B.parent
manifest=json.loads((B/'reports/build-manifest.json').read_text());plans={p['id']:p for p in manifest}
priorities=[l.strip().split('|') for l in (R/'priorities.txt').read_text().splitlines() if l.strip()]
profiles=R/'apps';profiles.mkdir(exist_ok=True)
rows=[];audit=[]
for rank,(slug,buyer,offer,asset,activation,gap,keywords) in enumerate(priorities,1):
 ident=slug+'-platform';p=plans[ident];app=ROOT/ident
 files=['README.md','FEATURE_STATUS.md','apps.txt','config/app.json','config/modules.json','config/merged-features.json','reports/feature-map.json','reports/build.json','reports/verification.json','reports/row-popup-verification.json']
 content={f:(app/f).read_text() for f in files}
 features=json.loads(content['config/merged-features.json']);mapping=json.loads(content['reports/feature-map.json']);config=json.loads(content['config/app.json'])
 assert set(content['apps.txt'].splitlines())==set(p['sources'])
 assert json.loads(content['reports/verification.json'])['status']=='passed'
 assert json.loads(content['reports/row-popup-verification.json'])['status']=='passed'
 assert all(all(k in f for k in ['id','title','mode','fields','sources']) for f in features)
 words=keywords.split(',');matched=[f for f in features if any(w.lower() in f['title'].lower() for w in words)]
 evidence=[{'id':f['id'],'title':f['title'],'mode':f['mode'],'fieldCount':len(f['fields']),'calculators':len(f.get('calculations',[]))} for f in matched[:12]]
 calc=sum(len(f.get('calculations',[])) for f in features)
 # The ordering is an editorial prioritization hypothesis, not a measured score.
 row=dict(rank=rank,id=ident,title=p['title'],buyer=buyer,focusedOffer=offer,organicAsset=asset,activation=activation,mainGap=gap,sourceApps=len(p['sources']),nativePages=len(features),registeredCalculations=calc,sourceEvidence=evidence,confidence='provisional; demand and conversion not measured',readiness='local workspace; public funnel and specialized workflow work required')
 rows.append(row)
 audit.append({'id':ident,'filesRead':[{'file':str(app/f),'sha256':hashlib.sha256(content[f].encode()).hexdigest()} for f in files],'featuresReviewed':len(features),'fieldDefinitionsReviewed':sum(len(f['fields']) for f in features),'mappedSourceEntries':len(mapping['mapped']),'sources':p['sources']})
 tier='First experiment shortlist' if rank<=5 else 'Next experiments' if rank<=15 else 'Later or more specialized experiments'
 text=f'''# {rank}. {p['title']}

**Organic growth priority:** {rank} of 64. **Tier:** {tier}. This is our provisional ranking using HeyCatch's publicly described growth approach, not a score produced by HeyCatch or a revenue forecast.

## Focus and evidence

- Proposed buyer: {buyer}.
- Proposed first offer: **{offer}**.
- Candidate organic asset: **{asset}**.
- First meaningful product action: **{activation}**.
- Main additional product work: **{gap}**.
- Inspected: {len(p['sources'])} assigned source apps, {len(features)} canonical pages and {sum(len(f['fields']) for f in features)} field definitions. There are {calc} registered calculation variants in this platform; this does not establish complete workflow parity.

This rank favors a specific buyer, useful educational material, an understandable first result, repeat-use opportunities and a measurable growth experiment. It does not reward the number of generic feature pages. Lower rankings reflect a less suitable initial organic experiment in this portfolio, not lower market size or profitability.

## Use the broader HeyCatch approach

1. **Audience, market and competitor research:** interview {buyer.lower()} about how they currently handle {offer.lower()}. Compare the actual alternatives they name, including spreadsheets and manual service. Record objections and switching costs before claiming a competitive advantage. No competitor gap or keyword demand has yet been validated.
2. **Positioning and landing-page conversion:** test a dedicated page for “{offer} for {buyer.lower()}.” Show a truthful saved-record example, explain the current boundary and use one call to action: try the narrow workflow. Do not market the entire merged suite as one initial offer.
3. **Content ideation and improvement:** create {asset.lower()}. Use examples with fictional inputs and describe what the software actually does. Review which example attracts qualified prospects, rather than optimizing impressions alone.
4. **SEO and GEO:** research specific questions about {offer.lower()}, then publish useful answer pages and worked examples on a public, crawlable site. Link them to the relevant demonstration. Verify indexing and actual referrals; AI-search citations and traffic are not guaranteed.
5. **Distribution and customer discovery:** test one community, educator, consultant or specialist partner channel that reaches this buyer. Adapt the worked example into an appropriate post or demonstration. Seek permission where community rules require it. No posts or messages have been sent.
6. **Onboarding:** guide a new user toward this event: {activation.lower()}. Remove unrelated menus from the first-use flow. The full merged feature set can remain available after the initial task.
7. **Lifecycle email:** draft a welcome explanation, an abandoned-first-task reminder and a next-task example for opted-in users. The email provider, consent records and event triggers need implementation before delivery; this plan sends nothing.
8. **Analytics and improvement:** instrument landing view → CTA → signup/demo start → first meaningful action → return action → paid conversion when billing exists. Segment by channel and content asset. Current record counts and audit logs are not acquisition analytics.
9. **Dynamic roadmap:** use observed objections and funnel drop-offs to pick one product or messaging change per iteration. The first product priority is: {gap.lower()}. Re-rank using qualified activation and retention evidence, not publishing volume.
10. **App-store work, if applicable later:** consider listing and store conversion only after a distributable product exists. These builds are browser workspaces; no mobile-store package or listing was found in the built output.

## Current implementation boundary

The app is a local single-user workspace. Shared record CRUD, links, files, export, audit and optional AI draft transport exist. A feature name such as “analysis,” “prediction,” “approval” or “generation” is not proof that its specialized engine exists. Provider actions are request preparation unless explicitly implemented; live AI needs configuration and validation. Public deployment, safe customer access, an acquisition landing page, funnel telemetry and lifecycle email are not established by the local test reports.

The previous build/API and row-popup checks passed; this review reads their evidence and does not claim a new end-to-end execution. No app source or production data was changed for the ranking, and nothing was imported into a HeyCatch account.

## Matching native feature definitions

| Feature | Native mode | Fields | Registered calculations |
| --- | --- | ---: | ---: |
'''
 for e in evidence:text+=f"| {e['title'].replace('|','/')} | {e['mode']} | {e['fieldCount']} | {e['calculators']} |\n"
 text+=f'\n[App feature status]({app}/FEATURE_STATUS.md) · [Source feature map]({app}/reports/feature-map.json) · [All 64 rankings](../RANKING.md)\n'
 (profiles/(ident+'.md')).write_text(text)
assert len(rows)==64 and len({r['id'] for r in rows})==64
(R/'ranking.json').write_text(json.dumps({'asOf':datetime.now(timezone.utc).isoformat(),'basis':'Organic growth across the full discovery-to-retention funnel; editorial hypothesis, not HeyCatch-generated scores','items':rows},indent=2)+'\n')
(R/'scan-evidence.json').write_text(json.dumps(audit,indent=2)+'\n')
report='''# 64-app ranking for organic growth with HeyCatch

**Recommended first experiment: Field Services**, focused on estimate preparation for small trade contractors. Next: Beauty, Pet Services, Nonprofit and Professional Services. These are prioritized experiments, not a profitability ranking or a claim of proven demand.

## What “with HeyCatch” means here

HeyCatch describes an organic growth product covering audience and competitor research, positioning, distribution, content, landing pages, onboarding, email, SEO/GEO and analytics that inform an evolving plan. This assessment uses that broader approach; it is not restricted to social listening. [HeyCatch product description](https://heycatch.ai/)

The ranking was prepared locally from the 64 apps and HeyCatch's public material. It was **not generated inside a HeyCatch account**. Public product descriptions are not proof that every capability is available in your account or plan.

## Ranking method

Organic growth is the first priority. I considered, in order:

1. Whether a narrow buyer problem can support useful content, search discovery and a credible demonstration.
2. Whether the buyer can be reached through a focused community, educator, partner or specialist channel.
3. Whether the promise can translate into a clear landing page and a short first-use journey.
4. Whether repeat tasks support onboarding, lifecycle email and retention measurement.
5. Whether the present implementation can support an honest experiment without a large unbuilt dependency.

This is an editorial ordering, not a calculated market score. Adjacent ranks are weak preferences. No keyword volumes, competitor gaps, conversion rates, willingness-to-pay interviews, founder distribution assets or acquisition cohorts have been measured. Page count is not a ranking input. Strong audience access or better activation evidence can change the order substantially.

HeyCatch's content guidance connects customer questions and search intent with product feedback; its post-launch guide uses funnel and email behavior to choose the next experiment. Those are the operating principles proposed here. [Content ideation guide](https://heycatch.ai/blog/content-ideation-for-founders-a-revenue-first-guide), [Post-launch analysis guide](https://heycatch.ai/blog/post-launch-analysis-a-solo-founder-recovery-guide)

## All 64, in order

Each app name links to its evidence, proposed use of the wider HeyCatch workflow, activation event and remaining product work. All folder names below are under `/Volumes/external/projects/` (also accessible through `/Users/erolakarsu/external/projects/`).

| Rank | App | Folder name | Narrow first offer | Organic content / conversion asset |
| ---: | --- | --- | --- | --- |
'''
for r in rows:report+=f"| {r['rank']} | [{r['title']}](apps/{r['id']}.md) | `{r['id']}` | {r['focusedOffer']} | {r['organicAsset']} |\n"
report+='''
## Why the first five

- **Field Services:** a focused estimate-preparation offer can connect worked examples to a concrete saved estimate and a recurring job workflow. Actual quote rules, customer approval and delivery still need validation.
- **Beauty:** appointment and rebooking administration supports practical educational content and recurring usage. Scheduling correctness and public booking still need implementation checks.
- **Pet Services:** mobile grooming gives a narrower starting buyer than the entire pet/veterinary suite. Quote and visit examples can lead directly into a small first-use workflow; dispatch and notifications remain gaps.
- **Nonprofit:** proposal evidence and review organization lends itself to worked outlines and useful answer pages. Source intake, citation reliability and reviewer access must support the promise.
- **Professional Services:** client handoff and deliverable records can be demonstrated with a small template-led workflow. The client portal and acceptance process still need completion.

These judgments describe testable fit, not verified channel performance. Commerce and Property also deserve focused tests because they include registered calculation adapters that can support concrete worked examples. Broad Developer, Marketing and Media suites have content opportunities, but their initial offer must not imply unimplemented scanning, automation or generation.

## A complete first experiment

Choose one app and one narrow workflow. Use research to test the buyer and current alternatives; publish a truthful focused landing page and one useful example; make the first-use task easy; prepare permission-based onboarding email; instrument qualified activation and repeat use; then revise one bottleneck at a time. Track paid conversion only when checkout and billing actually exist. This is a proposed experiment, not a campaign already executed.

Start with audience interviews and the first-five shortlist. Compare landing and demo responses before committing to a larger implementation. Avoid treating all 64 as simultaneous campaigns. Select the next app from measured qualified demand and activation evidence rather than impressions or the number of drafted posts.

## Scope of careful inspection

Read 10 files for each of 64 apps: README, feature status, source-app list, app/modules/feature configuration, source mapping, and build/API/row-popup evidence. The scan covered all 16,529 canonical feature definitions, including their field and calculation metadata. [File hashes and scan evidence](scan-evidence.json) make the review traceable. This was a static product and implementation review, not a fresh test of all specialized workflows or a new audit of every line in all 815 original source projects.

All are local workspaces. A successful build, populated table or clickable popup does not establish a public customer funnel or complete specialized business logic. Hosted access, real onboarding analytics, provider integration and source-specific rules remain material work. No apps were moved, no business data was changed, no messages were sent, and no HeyCatch account import or publication was performed.
'''
(R/'RANKING.md').write_text(report)
(ROOT/'HEYCATCH_ORGANIC_GROWTH_RANKING.md').write_text('# HeyCatch organic growth ranking\n\n[Open the complete 64-app ranking and individual growth plans](./_platform-builder/reports/heycatch-ranking/RANKING.md).\n\nFirst five: Field Services, Beauty, Pet Services, Nonprofit, Professional Services. This is an organic growth prioritization hypothesis using HeyCatch’s wider growth workflow, not a profitability forecast or a score generated by HeyCatch.\n')
print(json.dumps({'apps':len(rows),'filesRead':sum(len(a['filesRead']) for a in audit),'featuresReviewed':sum(a['featuresReviewed'] for a in audit),'fieldsReviewed':sum(a['fieldDefinitionsReviewed'] for a in audit),'profiles':len(list(profiles.glob('*.md'))),'report':str(R/'RANKING.md')},indent=2))
