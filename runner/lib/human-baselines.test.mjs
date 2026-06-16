// Deterministic test for the human-baseline instrument.
// Run: node --test runner/lib/human-baselines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_BASELINE_MIN_N,
  summarizeHumanBaselines,
  validateBaselineRecord,
  withHumanBaselines,
} from './human-baselines.mjs';

const rec = (world_id, human_id, elapsed_seconds, success = true) => ({
  world_id,
  human_id,
  elapsed_seconds,
  success,
});

test('validateBaselineRecord catches missing/invalid fields', () => {
  assert.equal(validateBaselineRecord(rec('w', 'h', 10)), null);
  assert.match(validateBaselineRecord({ human_id: 'h', elapsed_seconds: 1, success: true }), /world_id/);
  assert.match(validateBaselineRecord({ world_id: 'w', human_id: 'h', elapsed_seconds: -1, success: true }), /non-negative/);
  assert.match(validateBaselineRecord({ world_id: 'w', human_id: 'h', elapsed_seconds: 1, success: 'yes' }), /boolean/);
});

test('summarize gates headline-eligibility on >= 3 distinct humans', () => {
  const two = summarizeHumanBaselines([rec('w', 'h1', 30), rec('w', 'h2', 40)]);
  assert.equal(two.humans, 2);
  assert.equal(two.headline_eligible, false);
  assert.equal(two.minimum_humans, HUMAN_BASELINE_MIN_N);

  const three = summarizeHumanBaselines([rec('w', 'h1', 30), rec('w', 'h2', 40), rec('w', 'h3', 50)]);
  assert.equal(three.humans, 3);
  assert.equal(three.headline_eligible, true);
  assert.equal(three.median_seconds, 40);
});

test('summarize computes per-world median + success rate', () => {
  const s = summarizeHumanBaselines([
    rec('a', 'h1', 10, true),
    rec('a', 'h2', 30, false),
    rec('b', 'h3', 100, true),
  ]);
  const a = s.per_world.find((w) => w.world_id === 'a');
  assert.equal(a.samples, 2);
  assert.equal(a.median_seconds, 20);
  assert.equal(a.success_rate, 0.5);
});

test('summarize throws on a malformed record (never silently inflates a headline)', () => {
  assert.throws(() => summarizeHumanBaselines([rec('w', 'h', 10), { world_id: 'w' }]), /human baseline\[1\]/);
});

test('withHumanBaselines requires BOTH holdout split AND the human minimum', () => {
  const holdoutReport = { corpus: { headlineEligible: true } };
  // holdout-eligible run + < 3 humans -> NOT headline-eligible
  const under = withHumanBaselines(holdoutReport, [rec('w', 'h1', 10), rec('w', 'h2', 10)]);
  assert.equal(under.corpus.headlineEligible, false);
  assert.equal(under.human_baseline_summary.humans, 2);

  // holdout-eligible run + >= 3 humans -> headline-eligible
  const over = withHumanBaselines(holdoutReport, [rec('w', 'h1', 10), rec('w', 'h2', 10), rec('w', 'h3', 10)]);
  assert.equal(over.corpus.headlineEligible, true);

  // public run (not holdout) stays NOT headline-eligible even with humans
  const publicReport = { corpus: { headlineEligible: false } };
  const pub = withHumanBaselines(publicReport, [rec('w', 'h1', 10), rec('w', 'h2', 10), rec('w', 'h3', 10)]);
  assert.equal(pub.corpus.headlineEligible, false);
});
