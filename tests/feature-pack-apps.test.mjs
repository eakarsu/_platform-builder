import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../template/hub/runtime/store.mjs';
import { insightCatalog, runInsight } from '../template/hub/runtime/insights.mjs';

const APPS = ['governance-platform', 'healthcare-revenue-platform', 'home-care-platform', 'hospital-platform', 'hospitality-platform'];
const projectsRoot = fileURLToPath(new URL('../../', import.meta.url));

async function loadApp(app) {
  const root = path.join(projectsRoot, app);
  const features = JSON.parse(await readFile(path.join(root, 'config/merged-features.json'), 'utf8'))
    .map((f) => ({ ...f, ai: !['report', 'audit'].includes(f.mode) && (f.ai || /\b(ai|assistant|generator|analyzer|predictor|optimizer|summarizer)\b/i.test(f.title)) }));
  const pack = JSON.parse(await readFile(path.join(root, 'config/feature-pack.json'), 'utf8'));
  return { features, pack };
}

test('wave 8A apps each define 2-3 domain-grounded insights over real features', async () => {
  for (const app of APPS) {
    const { features, pack } = await loadApp(app);
    assert.ok(pack.insights.length >= 2 && pack.insights.length <= 3, `${app}: 2-3 insights`);
    assert.equal(new Set(pack.insights.map((d) => d.id)).size, pack.insights.length, `${app}: unique ids`);
    const catalog = insightCatalog(features, {}, pack.insights);
    assert.deepEqual(catalog.map((d) => d.id), pack.insights.map((d) => d.id), `${app}: catalog resolves pack`);
    for (const def of pack.insights) assert.ok(features.some((f) => f.id === def.feature && f.mode === 'records'), `${app}: ${def.id} grounded in records`);
  }
  const { pack } = await loadApp('healthcare-revenue-platform');
  for (const def of pack.insights) assert.match(def.focus, /no.*clinical|diagnosis/i, `healthcare guard: ${def.id}`);
});

test('wave 8A pack insight is deterministic fallback without a provider and preserves 0/false', async () => {
  const saved = {};
  for (const k of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENAI_API_KEY']) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    const { features, pack } = await loadApp('healthcare-revenue-platform');
    const store = openStore(':memory:', features);
    try {
      const def = pack.insights[0];
      store.create(def.feature, { title: 'Zero paid denial', data: { paidAmount: 0 } });
      const result = await runInsight(store, { kind: 'summarize-feature', featureId: def.feature }, undefined, features);
      assert.equal(result.aiGenerated, false);
      assert.equal(result.fallback, true);
      assert.match(result.label, /Deterministic fallback/);
      assert.equal(result.data.total, 1);
      assert.equal(result.data.fieldCoverage.find((c) => c.field === 'paidAmount').filled, 1);
      const priority = await runInsight(store, { kind: 'priority-actions' }, undefined, features);
      assert.equal(priority.data.hasOverdue, false);
      assert.equal(priority.data.overdueCount, 0);
    } finally { store.close(); }
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
