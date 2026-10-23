import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { openStore } from '../template/hub/runtime/store.mjs';
import { workspaceAPI } from '../template/hub/runtime/api.mjs';
import { insightCatalog, runInsight } from '../template/hub/runtime/insights.mjs';
import { renderAnswer } from '../template/hub/public/assistant.js';

const APPS = ['hospitality-platform', 'insurance-platform', 'investment-platform', 'lab-traceability-platform', 'legal-platform'];
const projectsRoot = fileURLToPath(new URL('../../', import.meta.url));

async function loadApp(app) {
  const root = path.join(projectsRoot, app);
  const features = JSON.parse(await readFile(path.join(root, 'config/merged-features.json'), 'utf8'))
    .map((f) => ({ ...f, ai: !['report', 'audit'].includes(f.mode) && (f.ai || /\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b/i.test(f.title)) }));
  const pack = JSON.parse(await readFile(path.join(root, 'config/feature-pack.json'), 'utf8'));
  return { features, pack };
}
function clearKeys() { const s = {}; for (const k of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'WORKSPACE_AUTH_TOKEN']) { s[k] = process.env[k]; delete process.env[k]; } return s; }
function restore(s) { for (const [k, v] of Object.entries(s)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }

test('wave 20C apps each define 2-3 domain-grounded insights over real records features plus priority-actions', async () => {
  for (const app of APPS) {
    const { features, pack } = await loadApp(app);
    const domain = pack.insights.filter((d) => d.id !== 'priority-actions');
    assert.ok(domain.length >= 2 && domain.length <= 3, `${app}: 2-3 domain insights, got ${domain.length}`);
    assert.ok(pack.insights.some((d) => d.id === 'priority-actions'), `${app}: priority-actions present`);
    assert.equal(new Set(pack.insights.map((d) => d.id)).size, pack.insights.length, `${app}: unique ids`);
    assert.deepEqual(insightCatalog(features, {}, pack.insights).map((d) => d.id), pack.insights.map((d) => d.id), `${app}: catalog resolves pack`);
    for (const def of pack.insights) assert.ok(features.some((f) => f.id === def.feature && f.mode === 'records'), `${app}: ${def.id} grounded in records`);
    assert.ok(features.some((f) => f.id === 'tasks' && f.mode === 'records'), `${app}: tasks feature exists`);
  }
});

test('wave 20C insight fallback is deterministic without a provider, preserves 0/false, provider only when configured', async () => {
  const saved = clearKeys();
  try {
    const { features, pack } = await loadApp('insurance-platform');
    const store = openStore(':memory:', features);
    try {
      const def = pack.insights.find((d) => d.id !== 'priority-actions');
      store.create(def.feature, { title: 'Zero case', data: {} });
      const result = await runInsight(store, { kind: 'summarize-feature', featureId: def.feature }, undefined, features);
      assert.equal(result.aiGenerated, false);
      assert.equal(result.fallback, true);
      assert.match(result.label, /Deterministic fallback/);
      assert.equal(result.data.total, 1);
      const priority = await runInsight(store, { kind: 'priority-actions' }, undefined, features);
      assert.equal(priority.aiGenerated, false);
      assert.equal(priority.data.hasOverdue, false);
      assert.equal(priority.data.overdueCount, 0);
      assert.equal(priority.sections.find((s) => s.label === 'Has overdue items').value, false);
      assert.equal(priority.sections.find((s) => s.label === 'Overdue count').value, 0);
      let calls = 0;
      const ok = await runInsight(store, { kind: 'summarize-feature', featureId: def.feature }, async () => { calls++; return { model: 'mock', choices: [{ message: { content: 'Grounded narrative.' } }] }; }, features);
      assert.equal(ok.aiGenerated, true);
      assert.equal(ok.fallback, false);
      assert.equal(calls, 1);
    } finally { store.close(); }
  } finally { restore(saved); }
});

test('wave 20C AI sections render as labelled readable sections preserving false/0/empty', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/overview' });
  const prior = {};
  for (const key of ['document', 'window', 'Option', 'location', 'sessionStorage']) { prior[key] = globalThis[key]; globalThis[key] = dom.window[key]; }
  try {
    const out = renderAnswer(JSON.stringify([
      { label: 'Has overdue items', value: false },
      { label: 'Overdue count', value: 0 },
      { label: 'Notes', value: '' },
    ]));
    assert.match(out.textContent, /Has overdue items/);
    assert.match(out.textContent, /No/);
    assert.match(out.textContent, /Overdue count/);
    assert.match(out.textContent, /Empty/);
    assert.ok(!out.textContent.includes('"value":false'), 'raw JSON must not be dumped');
  } finally {
    dom.window.close();
    for (const [k, v] of Object.entries(prior)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
});

test('wave 20C authenticated tasks CRUD, search/filter, CSV+JSON export and insight route over HTTP', async () => {
  const saved = clearKeys();
  process.env.WORKSPACE_AUTH_TOKEN = 'wave20c-token';
  try {
    const { features, pack } = await loadApp('hospitality-platform');
    const store = openStore(':memory:', features);
    const api = workspaceAPI(store, { features, app: { id: 'hospitality-platform' }, featurePack: pack });
    const server = http.createServer((req, res) => api(req, res, new URL(req.url, `http://${req.headers.host}`)));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const H = { 'Content-Type': 'application/json', 'X-Legal-Workspace': '1', Authorization: 'Bearer ' + process.env.WORKSPACE_AUTH_TOKEN };
    try {
      assert.equal((await fetch(base + '/api/workspace/features/tasks/records')).status, 401);
      const createdRes = await fetch(base + '/api/workspace/features/tasks/records', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Wave20C task', status: 'review', data: { assignee: 'Sam', priority: 'high' } }) });
      assert.equal(createdRes.status, 201);
      const created = await createdRes.json();
      assert.ok(created.id);
      const updated = await (await fetch(base + `/api/workspace/records/${created.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ ...created, title: 'Wave20C task updated', status: 'active' }) })).json();
      assert.equal(updated.title, 'Wave20C task updated');
      assert.equal(updated.revision, created.revision + 1);
      const list = await (await fetch(base + '/api/workspace/features/tasks/records', { headers: H })).json();
      assert.equal(list.length, 1);
      const filtered = await (await fetch(base + '/api/workspace/features/tasks/records?q=Wave20C&status=active', { headers: H })).json();
      assert.equal(filtered.length, 1);
      const noMatch = await (await fetch(base + '/api/workspace/features/tasks/records?q=no-such-thing', { headers: H })).json();
      assert.equal(noMatch.length, 0);
      const csv = await (await fetch(base + '/api/workspace/features/tasks/records/export', { headers: H })).text();
      assert.match(csv, /Wave20C task updated/);
      const jsonRes = await fetch(base + '/api/workspace/features/tasks/records/export?format=json', { headers: H });
      assert.match(jsonRes.headers.get('content-type'), /application\/json/);
      const json = await jsonRes.json();
      assert.equal(json.count, 1);
      assert.equal(json.records[0].title, 'Wave20C task updated');
      const insightRes = await fetch(base + `/api/workspace/insights/${pack.insights[0].id}`, { method: 'POST', headers: H, body: '{}' });
      assert.equal(insightRes.status, 201);
      const insight = await insightRes.json();
      assert.equal(insight.aiGenerated, false);
      assert.equal(insight.fallback, true);
      assert.ok(Array.isArray(insight.sections));
    } finally { await new Promise((r) => server.close(r)); store.close(); }
  } finally { restore(saved); }
});
