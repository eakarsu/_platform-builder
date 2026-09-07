# Shared platform builder

Maintained source and build tooling for the 64 sibling platform apps in this directory. See [the complete app and port index](../PLATFORM_BUILD_REPORT.md). The builder is not an additional product.

## Run and rebuild

Node 22.13+ is required. Runtime and build code use Node built-ins; no package installation or PostgreSQL setup is required.

```sh
cd /Users/erolakarsu/external/projects/beauty-platform
./start.sh
# Stop with Control-C. Rebuild after changing shared code or app configuration:
npm run build
npm test
```

Each app has its own configuration, SQLite database and default port. Startup clears only the selected port before seeding and serving on loopback. `PORT` or `HUB_PORT` overrides the default. `SEED_DEMO_DATA=0` disables the top-up to 15 fictional records per editable feature. Rebuilding preserves the app's database. AI draft transport uses optional user-supplied OpenRouter configuration in the app's `.env`; tests use a mock transport and do not establish live provider availability.

## Maintained files

- `template/`: shared server, UI, SQLite store, validation, exports, attachments, AI transport and seeder. Change shared behavior here, then rebuild affected apps.
- Each app's `config/`: branding, source assignments, modules, canonical features and field definitions.
- Each app's `reports/feature-map.json`: source-to-canonical mapping and exclusions. A mapping is not proof of source business-rule parity.
- Each app's `reports/engines.json`: registered pure source calculators with content hashes. Build checks source hashes before copying a snapshot into `dist/engines`.
- Each app's `dist/`: standalone generated runtime. Do not edit it as maintained source.
- `reports/build-manifest.json`: authoritative grouping of 815 candidates into 64 products. `financialServices_salesforce` was corrected to Sales after reviewing its CRM/outreach schema.

## Checks

```sh
cd /Users/erolakarsu/external/projects/_platform-builder
npm test
npm run build:all
npm run test:browser
npm run test:startup
npm run test:rows
python3 scripts/finalize.py
```

`build:all` builds each app, exercises its APIs in an isolated database, and seeds its real local demo database. `test:browser` visits every feature page and checks CRUD persistence and mobile navigation/layout. It uses the existing Playwright installation under `../homeservices/node_modules/@playwright/test`; browser binaries must be installed there. `test:startup` runs each actual `start.sh` on its assigned port, verifies health, and stops the process it started. As with normal startup, this clears those selected ports. Run startup checks when those ports can be restarted.

For selected builds/browser checks, set `PLATFORMS=beauty-platform,pet-services-platform`. Startup checks currently cover all 64. `finalize.py` checks report consistency, source assignments, current database row counts and configuration/artifact equality, then writes the portfolio index and app status evidence. It requires Python 3 with SQLite support.

## Re-extracting source definitions

For intentional source remapping only, run these commands before building and testing. They regenerate app configuration and scaffold files, so preserve any manual configuration changes first.

```sh
node scripts/extract.cjs
python3 scripts/add-reviewed-workflows.py
python3 scripts/compile.py
python3 scripts/scaffold.py
```

Extraction statically reads source metadata and TypeScript syntax; it does not launch original applications. It uses the TypeScript installation at `/Users/erolakarsu/projects/smallLawFirm/node_modules/typescript` unless `TYPESCRIPT_MODULE` is set. The reviewed-workflows step adds explicit schema-backed mappings for six otherwise unmapped sources. `scripts/prepare-runtime.py` is a historical one-time bootstrap script; do not rerun it against the maintained template.

## Implemented scope and remaining migration

The apps implement local single-user record workflows: shared clients/work items, typed forms, relationships, persistence, search, files, CSV, audit, report totals and optional AI drafts. Registered calculators retain their narrow source calculation behavior. Common features share canonical sidebar pages and source mappings.

The builds do not provide full parity with every original source's business rules, state machines, independent review controls, authentication, tenant isolation, provider workers or external delivery. Integration features store prepared requests only. Source-specific migrations remain documented in each `FEATURE_STATUS.md` and source mapping warnings. Original credentials, users and business databases were not imported or modified. The new external Legal Platform is separate from the existing internal-drive Legal Platform.

`reports/sources-needing-manual-migration.json` now has no sources lacking any native mapping. That does not mean all business logic has been migrated. The six reviewed additions have record/request implementations and still need their specialized rules and provider behavior.

## Row details popup

All shared record tables support clicking any cell or pressing Enter/Space on a focused row to open centered details. Edit opens the existing validated form; saving updates the popup and underlying list. Delete requires confirmation inside the popup and respects relationship constraints. Cancel/Escape returns focus to the row. Full-record navigation remains available for attachments, calculations and AI drafts. Audit events and calculated report aggregates remain read-only. `test:rows` tests the behavior in an isolated database for each of the 64 apps, including mobile centering and persistence.

## AI question-and-answer workspaces

AI feature pages now open a question form and formatted answer panel instead of a record table. Users can supply feature-specific fields, paste context, select an existing record, ask follow-up questions, reopen saved answers, copy answers and download Markdown. Existing records remain stored and can be selected as context. Non-AI tables retain their row-details popup.

The server calls the existing OpenRouter transport. Configure `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in each app's `.env`, then restart that app. Missing configuration returns a setup error; no sample answer is used as a provider response. Answers and their explicit context are stored in `ai_answers` in the same local SQLite database. Only selected record fields are supplied; attachments are not automatically read. This is conversational assistance, not execution of unmigrated specialized engines or external actions.

The implementation is in `template/hub/public/assistant.js` and `template/hub/runtime/assistant.mjs`. The runtime marks existing AI features and explicitly AI-named assistant/generator/analyzer/predictor/optimizer/summarizer pages as conversational features, excluding generated audit/report views. Build all apps after changing shared code. `npm run test:ai` checks every AI route across the 64 apps and uses a mocked provider to exercise questions, explicit context, follow-ups, safe formatting, persistence across restart, downloads and failure recovery. `npm test` includes input validation and missing-provider checks. These checks do not establish live model quality or provider availability.

## Merged AI environment settings

Each of the 64 app folders now has a private, Git-ignored `.env`. Shared runtime AI settings were merged from the assigned original source apps. Existing nonempty destination values are preserved; each destination retains its port. The model is the most common explicit OpenRouter model in that app's source group. Conflicting keys stop the merge instead of choosing one silently. Database, billing and unrelated provider settings are not required by this local SQLite/OpenRouter runtime.

`node scripts/merge-ai-env.mjs` repeats this process. It never prints credential values. `reports/env-merge-results.json` contains nonsecret provenance and model selection information. `node scripts/verify-ai-env.mjs` makes one small live AI request for each distinct configured model and records whether answer text was returned; it uses provider credits. Restart a running app after environment changes. Beauty was restarted and verified as connected after this merge.

## 5,000-word questions and detailed answers

AI questions accept up to 5,000 whitespace-separated words, with a 100,000-character transport guard. The interface shows the current word count and prevents over-limit submissions; the server validates the same limit. Long questions are expandable in the answer header. Answers show their actual word count and can be saved or downloaded at full length.

Question responses and legacy record drafts now request up to 16,000 output tokens, supporting detailed answers up to 5,000 words. The prompt honors shorter requests and avoids padding. The provider controls the actual answer length; this is a supported target, not a guarantee of exactly 5,000 words. The default long-answer timeout is 180 seconds, respecting an explicit `AI_TIMEOUT_MS` override. Up to four prior question/answer turns are included subject to the history size budget.

`npm run test:word-limits` checks 5,000-word questions and saved answers, 5,001-word rejection, counters, downloads, mobile layout and the provider request budget in all 64 apps with a mock provider.

## Grouped assistants and combined requests

The sidebar now shows up to eight AI assistants per app instead of one AI entry per capability. `template/scripts/assistant-groups.mjs` groups existing AI capabilities by task: writing/knowledge, planning, finance, growth, quality/risk, insights, creative work and general assistance. This classification groups related work; it does not discard source capabilities or claim their domain engines are equivalent. Original feature URLs remain aliases, with the corresponding capability selected in the grouped interface. Original record detail links remain usable.

Select up to eight capabilities and combine up to ten questions with one shared context. The backend sends one provider request and saves one answer under the group's representative feature. Existing answers remain under their original feature IDs and are pooled in the group's history; no destructive database migration is needed. Record context can be filtered by capability and searched so older records are accessible. Histories and context are limited to the selected assistant in the current app.

The combined question budget is 5,000 words and the response target is up to 5,000 words overall. Repeated questions are collapsed after trimming and whitespace/case normalization. Model output is requested in numbered sections followed by a common action plan. The app does not promise an exact word count or execution of unmigrated external tools.

`npm run test:ai-merge` verifies the new navigation, source mapping, old URLs/history, one-call combination, duplicate removal, shared context, follow-ups, assistant isolation, combined word limits and mobile layout in all 64 apps with mocked provider responses. `npm run report:ai-merge` writes each app's source-to-assistant mapping, status documentation and the portfolio report after all checks pass.

## Floating assistant implementation

The shared floating UI is template/hub/public/floating-assistant.js, mounted once outside page content. app.js supplies explicit item actions and dispatches workspace:navigate events. Dedicated /api/workspace/assistant/ask and /answers routes reuse answerQuestion and the existing AI provider. Validated registry metadata supplies page context and relevant feature links; selected records can belong to any feature in this app. Saved answers retain source=floating for independent history.

Run npm run test:floating-ai after npm run build:all, then node scripts/report-floating-ai.mjs to refresh completion reports. Test databases are temporary and use a mocked provider.

## GitHub source repositories

The 64 generated apps have separate private repositories under `eakarsu`, using their folder names. Clone this repository as `_platform-builder` beside app clones. Each app builds with `npm run build` and starts with `./start.sh`. Calculator source files are bundled in each app that uses them, so ordinary builds do not require the original source project folders. The independently maintained local legal workspace is in `eakarsu/legal-platform-local`.

Credentials, local databases, process files and verification screenshots are excluded from commits. Configure `.env` locally after cloning.
