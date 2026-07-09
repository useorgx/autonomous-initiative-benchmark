// Run: node --test runner/lib/validate-manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateManifest } from '../validate-manifest.mjs';

const valid = {
  contractVersion: 'orgx-bench-v1.1',
  id: 'fugu-regime-demo-2026-06-22',
  date: '2026-06-22',
  claim: 'Selective orchestration is more cost-resilient than reflexive orchestration on saturated tasks.',
  arms: [
    { id: 'single', system: 'single_frontier', model: 'deepseek/deepseek-v4-flash' },
    { id: 'fugu', system: 'fugu', model: 'fugu' },
  ],
  tasks: 'private_holdout',
  k: 8,
  metrics: ['pass_at_k', 'provenance_completeness'],
  modelManifest: {
    id: 'models-2026-06-22',
    createdAt: '2026-06-22T00:00:00.000Z',
    models: [
      {
        id: 'deepseek/deepseek-v4-flash',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        pinned: true,
        accessDate: '2026-06-22',
      },
      {
        id: 'fugu',
        provider: 'fugu',
        model: 'fugu',
        pinned: true,
        accessDate: '2026-06-22',
      },
    ],
  },
  lossPolicy: {
    publishAllAttempts: true,
    singleAgentWinsAreLosses: true,
    invalidRunsCountAsLosses: true,
  },
  lossRegistry: [
    { id: 'single_agent_quality_win', countedAsLoss: true, publicLabel: 'Single-agent quality win' },
    { id: 'invalid_output', countedAsLoss: true, publicLabel: 'Invalid output' },
    { id: 'timeout', countedAsLoss: true, publicLabel: 'Timeout' },
    { id: 'cost_loss', countedAsLoss: true, publicLabel: 'Cost loss' },
    { id: 'unmeasured', countedAsLoss: true, publicLabel: 'Unmeasured' },
  ],
  headlineEligible: false,
};

test('a complete manifest validates', () => {
  assert.deepEqual(validateManifest(valid), { ok: true, errors: [] });
});

test('an unnamed arm (Model A) is rejected', () => {
  const m = { ...valid, arms: [{ id: 'a' }, { id: 'b', model: 'x' }] };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /missing model/.test(e)));
});

test('headlineEligible:true on public worlds is rejected', () => {
  const m = { ...valid, tasks: 'public_validation_worlds_v2', headlineEligible: true };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /contamination-visible/.test(e)));
});

test('unknown metric is rejected', () => {
  const m = { ...valid, metrics: ['made_up_metric'] };
  assert.equal(validateManifest(m).ok, false);
});

test('thin claim is rejected', () => {
  const m = { ...valid, claim: 'we win' };
  assert.equal(validateManifest(m).ok, false);
});

test('missing model manifest is rejected', () => {
  const { modelManifest, ...m } = valid;
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /modelManifest is required/.test(e)));
});

test('an arm whose model is not pinned in the model manifest is rejected', () => {
  const m = {
    ...valid,
    arms: [
      ...valid.arms,
      { id: 'future-gpt', system: 'single_frontier', model: 'gpt-8' },
    ],
  };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not pinned in modelManifest/.test(e)));
});

test('missing loss registry is rejected', () => {
  const { lossRegistry, ...m } = valid;
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /lossRegistry must list/.test(e)));
});

test('headline manifests require private holdout, k floor, and human baseline policy', () => {
  const m = {
    ...valid,
    tasks: 'public_validation_worlds_v2',
    k: 2,
    headlineEligible: true,
  };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /contamination-visible/.test(e)));
  assert.ok(r.errors.some((e) => /private_holdout/.test(e)));
  assert.ok(r.errors.some((e) => /k >= 8/.test(e)));
  assert.ok(r.errors.some((e) => /humanBaselinePolicy/.test(e)));
});

test('headline manifests require horizon metrics and generator policy', () => {
  const m = {
    ...valid,
    tasks: 'private_holdout',
    k: 8,
    headlineEligible: true,
    humanBaselinePolicy: {
      minimumDistinctHumans: 3,
      timedRuns: true,
      blindReview: true,
      publishAggregate: true,
    },
  };
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /metric pass_pow_k/.test(e)));
  assert.ok(r.errors.some((e) => /metric horizon_50/.test(e)));
  assert.ok(r.errors.some((e) => /generatorPolicy/.test(e)));
});

test('a headline private-holdout manifest validates when the SOTA contract is complete', () => {
  const m = {
    ...valid,
    tasks: 'private_holdout',
    k: 8,
    metrics: [
      'pass_at_k',
      'pass_pow_k',
      'horizon_50',
      'horizon_80',
      'qualified_work_product_success',
    ],
    headlineEligible: true,
    humanBaselinePolicy: {
      minimumDistinctHumans: 3,
      timedRuns: true,
      blindReview: true,
      publishAggregate: true,
    },
    generatorPolicy: {
      type: 'parametric_generators',
      minimumGeneratorCount: 20,
      difficultyKnobsRequired: true,
      deterministicStateHash: true,
      monotonicityEvidenceRequired: true,
      canaryWorldCount: 10,
    },
  };
  assert.deepEqual(validateManifest(m), { ok: true, errors: [] });
});
