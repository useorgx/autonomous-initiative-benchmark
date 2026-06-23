// Run: node --test runner/lib/validate-manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateManifest } from '../validate-manifest.mjs';

const valid = {
  id: 'fugu-regime-demo-2026-06-22',
  date: '2026-06-22',
  claim: 'Selective orchestration is more cost-resilient than reflexive orchestration on saturated tasks.',
  arms: [
    { id: 'single', system: 'single_frontier', model: 'deepseek/deepseek-v4-flash' },
    { id: 'fugu', system: 'fugu', model: 'fugu' },
  ],
  tasks: 'private_holdout',
  metrics: ['pass_at_k', 'provenance_completeness'],
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
