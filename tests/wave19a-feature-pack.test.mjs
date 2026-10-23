import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../template/hub/runtime/store.mjs';
import { workspaceAPI } from '../template/hub/runtime/api.mjs';
import { insightCatalog, buildInsight } from '../template/hub/runtime/insights.mjs';

const APPS = ['aviation-platform', 'banking-credit-platform', 'beauty-platform', 'business-operations-platform', 'childcare-platform'];
const projectsRoot = fileURLToPath(new URL('../../', import.meta.url));

async function loadApp(app) {
  const root = path.join(projectsRoot, app);
  const features = JSON.parse(await readFile(path.join(root, 'config/merged-features.json'), 'utf8'))
    .map((f) => ({ ...f, ai: !['report', 'audit'].includes(f.mode) && (f.ai || /\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b/i.test(f.title)) }));
  const pack = JSON.parse(await readFile(path.join(root, 'config/feature-pack.json'), 'utf8'));
  return { features, pack };
}
function clearKeys() { for (const k of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY', 'WORKSPACE_AUTH_TOKEN']) delete process.env[k]; }

test('Wave 19A: every target app ships 2-3 domain insights plus priority actions over real features', async () => {
  for (const app of APPS) {
    const { features, pack } = await loadApp(app);
    const domain = pack.insights.filter((d) => d.feature !== 'tasks');
    assert.ok(domain.length >= 2 && domain.length <= 3, `${app}: 2-3 domain insights`);
    assert.ok(pack.insights.some((d) => d.id === 'priority-actions' && d.feature === 'tasks'), `${app}: priority actions`);
    assert.equal(new Set(pack.insights.map((d) => d.id)).size, pack.insights.length, `${app}: unique ids`);
    const catalog = insightCatalog(features, { id: app }, pack.insights);
    assert.deepEqual(catalog.map((d) => d.id), pack.insights.map((d) => d.id), `${app}: catalog resolves pack`);
    for (const def of pack.insights) assert.ok(features.some((f) => f.id === def.feature && f.mode === 'records'), `${app}: ${def.id} grounded in records`);
    assert.ok(features.some((f) => f.id === 'tasks' && f.mode === 'records'), `${app}: tasks feature`);
  }
});

test('Wave 19A: insight fallback is deterministic (aiGenerated:false) without keys and preserves 0/false', async () => {
  clearKeys();
  for (const app of APPS) {
    const { features, pack } = await loadApp(app);
    const store = openStore(':memory:', features);
    try {
      const domain = pack.insights.find((d) => d.feature !== 'tasks');
      const r = await buildInsight(store, features, { id: app }, domain.id, undefined, {}, pack.insights);
      assert.equal(r.aiGenerated, false, app);
      assert.equal(r.fallback, true, app);
      assert.match(r.label, /Deterministic fallback/, app);
      assert.equal(r.sections.find((s) => s.label === 'Total records').value, 0, app);
      assert.equal(r.sections.find((s) => s.label === 'Has records').value, false, app);
      const p = await buildInsight(store, features, { id: app }, 'priority-actions', undefined, {}, pack.insights);
      assert.equal(p.aiGenerated, false, app);
      assert.equal(p.sections.find((s) => s.label === 'Has overdue items').value, false, app);
      assert.equal(p.sections.find((s) => s.label === 'Overdue count').value, 0, app);
    } finally { store.close(); }
  }
});

test('Wave 19A: authenticated tasks CRUD, search/filter, CSV+JSON export and insight route over HTTP', async () => {
  clearKeys();
  process.env.WORKSPACE_AUTH_TOKEN = 'wave19a-test-token';
  try {
    for (const app of APPS) {
      const { features, pack } = await loadApp(app);
      const store = openStore(':memory:', features);
      const api = workspaceAPI(store, { features, app: { id: app }, featurePack: pack });
      const server = http.createServer((req, res) => api(req, res, new URL(req.url, `http://${req.headers.host}`)));
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const base = `http://127.0.0.1:${server.address().port}`;
      const H = { 'Content-Type': 'application/json', 'X-Legal-Workspace': '1' };
      const AUTH = { ...H, Authorization: 'Bearer wave19a-test-token' };
      try {
        assert.equal((await fetch(base + '/api/workspace/features/tasks/records', { headers: H })).status, 401, `${app}: list requires auth`);
        assert.equal((await fetch(base + '/api/workspace/features/tasks/records', { method: 'POST', headers: H, body: JSON.stringify({ title: 'No auth' }) })).status, 401, `${app}: create requires auth`);
        const createdRes = await fetch(base + '/api/workspace/features/tasks/records', { method: 'POST', headers: AUTH, body: JSON.stringify({ title: 'Wave19A task', status: 'review', data: { assignee: 'Sam', priority: 'high' } }) });
        assert.equal(createdRes.status, 201, `${app}: authenticated create`);
        const created = await createdRes.json();
        assert.equal((await fetch(base + `/api/workspace/records/${created.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ ...created, title: 'Wave19A task updated' }) })).status, 401, `${app}: update requires auth`);
        const updated = await (await fetch(base + `/api/workspace/records/${created.id}`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ ...created, title: 'Wave19A task updated', status: 'active' }) })).json();
        assert.equal(updated.title, 'Wave19A task updated', app);
        assert.equal(updated.revision, created.revision + 1, app);
        const filtered = await (await fetch(base + '/api/workspace/features/tasks/records?q=Wave19A&status=active', { headers: AUTH })).json();
        assert.equal(filtered.length, 1, `${app}: search+filter`);
        assert.equal((await (await fetch(base + '/api/workspace/features/tasks/records?q=nomatch19a', { headers: AUTH })).json()).length, 0, `${app}: search nomatch`);
        const csv = await (await fetch(base + '/api/workspace/features/tasks/records/export?q=Wave19A', { headers: AUTH })).text();
        assert.match(csv, /Wave19A task updated/, `${app}: CSV export`);
        const jsonRes = await fetch(base + '/api/workspace/features/tasks/records/export?format=json&q=Wave19A', { headers: AUTH });
        assert.match(jsonRes.headers.get('content-type'), /application\/json/, `${app}: JSON export type`);
        const json = await jsonRes.json();
        assert.equal(json.count, 1, `${app}: JSON export count`);
        assert.equal(json.records[0].title, 'Wave19A task updated', app);
        const insightRes = await fetch(base + `/api/workspace/insights/${pack.insights[0].id}`, { method: 'POST', headers: AUTH, body: '{}' });
        assert.equal(insightRes.status, 201, `${app}: insight route`);
        const insight = await insightRes.json();
        assert.equal(insight.aiGenerated, false, `${app}: insight fallback without keys`);
        assert.ok(Array.isArray(insight.sections) && insight.sections.length > 0, `${app}: labelled sections`);
      } finally { await new Promise((r) => server.close(r)); store.close(); }
    }
  } finally { clearKeys(); }
});
