// Run: node --test runner/lib/calculation-replay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { extractNumbers, replayClaims, evidenceScore } from './calculation-replay.mjs';

test('extractNumbers handles $, commas, decimals, percents', () => {
  assert.deepEqual(extractNumbers('ARR is $186,000 from 12 accounts at 5.5% churn'), [186000, 12, 5.5]);
});

test('a grounded derivation scores 1.0 (every number traces to observed data)', () => {
  const observed = [100000, 50000, 36000, 186000];
  const derivation = 'Summed 100,000 + 50,000 + 36,000 = 186,000.';
  assert.equal(replayClaims(derivation, observed).supportRate, 1);
});

test('a fabricated intermediate is caught (right total, invented step)', () => {
  const observed = [100000, 50000, 36000, 186000];
  // 999 was never observed — a fabricated number that still sums "to" the answer in prose
  const derivation = 'Took 100,000 + 50,000 + 999 ... arriving at 186,000.';
  const r = replayClaims(derivation, observed);
  assert.equal(r.fabricated, 1);
  assert.deepEqual(r.fabricatedValues, [999]);
  assert.ok(r.supportRate < 1);
});

test('an empty/missing derivation scores 0 (required reasoning not shown)', () => {
  assert.equal(replayClaims('', [1, 2, 3]).supportRate, 0);
  assert.equal(evidenceScore(undefined, [1, 2, 3]).score, 0);
});

test('tolerance allows rounding; ignore drops noise tokens', () => {
  assert.equal(replayClaims('total 186,001', [186000], { tolerance: 5 }).supportRate, 1);
  assert.equal(replayClaims('step 1: 42', [42], { ignore: [1] }).supportRate, 1);
});
