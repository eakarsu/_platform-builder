import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../template/hub/runtime/store.mjs';
import { workspaceAPI } from '../template/hub/runtime/api.mjs';
import { insightCatalog, runInsight } from '../template/hub/runtime/insights.mjs';

const APPS = ['security-platform', 'semiconductor-platform', 'space-platform', 'specialty-care-platform', 'sports-fitness-platform'];
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

test('wave 10A apps each define 2-3 domain-grounded insights over real features', async () => {
  for (const app of APPS) {
    const { features, pack } = await loadApp(app);
    assert.ok(pack.insights.length >= 2 && pack.insights.length <= 3, `${app}: 2-3 insights`);
    assert.equal(new Set(pack.insights.map((d) => d.id)).size, pack.insights.length, `${app}: unique ids`);
    assert.deepEqual(insightCatalog(features, {}, pack.insights).map((d) => d.id), pack.insights.map((d) => d.id), `${app}: catalog resolves pack`);
    for (const def of pack.insights) assert.ok(features.some((f) => f.id === def.feature && f.mode === 'records'), `${app}: ${def.id} grounded in records`);
  }
  const { pack } = await loadApp('specialty-care-platform');
  for (const def of pack.insights.filter((d) => d.id !== 'priority-actions')) assert.match(def.focus, /no diagnosis/i, `healthcare guard: ${def.id}`);
});

test('wave 10A pack insight is deterministic fallback without a provider and preserves 0/false', async () => {
  const saved = clearKeys();
  try {
    const { features, pack } = await loadApp('security-platform');
    const store = openStore(':memory:', features);
    try {
      const def = pack.insights[0];
      store.create(def.feature, { title: 'Zero case', data: {} });
      const result = await runInsight(store, { kind: 'summarize-feature', featureId: def.feature }, undefined, features);
      assert.equal(result.aiGenerated, false);
      assert.equal(result.fallback, true);
      assert.match(result.label, /Deterministic fallback/);
      assert.equal(result.data.total, 1);
      assert.equal(result.data.hasRecords, true);
      const priority = await runInsight(store, { kind: 'priority-actions' }, undefined, features);
      assert.equal(priority.data.hasOverdue, false);
      assert.equal(priority.data.overdueCount, 0);
      assert.equal(priority.sections.find((s) => s.label === 'Has overdue items').value, false);
      assert.equal(priority.sections.find((s) => s.label === 'Overdue count').value, 0);
    } finally { store.close(); }
  } finally { restore(saved); }
});

test('wave 10A authenticated tasks CRUD, search/filter, CSV+JSON export and insight route over HTTP', async () => {
  const saved = clearKeys();
  process.env.WORKSPACE_AUTH_TOKEN = 'tok123';
  try {
    const { features, pack } = await loadApp('sports-fitness-platform');
    const store = openStore(':memory:', features);
    const api = workspaceAPI(store, { features, app: { id: 'sports-fitness-platform' }, featurePack: pack });
    const server = http.createServer((req, res) => api(req, res, new URL(req.url, `http://${req.headers.host}`)));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const H = { 'Content-Type': 'application/json', 'X-Legal-Workspace': '1', Authorization: 'Bearer ' + process.env.WORKSPACE_AUTH_TOKEN };
    try {
      assert.equal((await fetch(base + '/api/workspace/features/tasks/records')).status, 401);
      const created = await (await fetch(base + '/api/workspace/features/tasks/records', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Wave10A task', status: 'review', data: { assignee: 'Sam', priority: 'high' } }) })).json();
      assert.ok(created.id);
      const updated = await (await fetch(base + `/api/workspace/records/${created.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ ...created, title: 'Wave10A task updated', status: 'active' }) })).json();
      assert.equal(updated.title, 'Wave10A task updated');
      const filtered = await (await fetch(base + '/api/workspace/features/tasks/records?q=Wave10A&status=active', { headers: H })).json();
      assert.equal(filtered.length, 1);
      const csv = await (await fetch(base + '/api/workspace/features/tasks/records/export', { headers: H })).text();
      assert.match(csv, /Wave10A task updated/);
      const jsonRes = await fetch(base + '/api/workspace/features/tasks/records/export?format=json', { headers: H });
      assert.match(jsonRes.headers.get('content-type'), /application\/json/);
      assert.equal((await jsonRes.json()).records[0].title, 'Wave10A task updated');
      const insightRes = await fetch(base + `/api/workspace/insights/${pack.insights[0].id}`, { method: 'POST', headers: H, body: '{}' });
      assert.equal(insightRes.status, 201);
      const insight = await insightRes.json();
      assert.equal(insight.aiGenerated, false);
      assert.ok(Array.isArray(insight.sections));
    } finally { await new Promise((r) => server.close(r)); store.close(); }
  } finally { restore(saved); }
});
