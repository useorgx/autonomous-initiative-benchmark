// Run: node --test runner/lib/statistics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bcaBootstrapMeanInterval,
  bernoulliCoverageSimulation,
  pairedBinaryComparison,
  passPowerCurve,
  wilsonInterval,
} from './statistics.mjs';

test('wilsonInterval returns a bounded non-vacuous interval', () => {
  const interval = wilsonInterval(6, 8);
  assert.ok(interval.low > 0);
  assert.ok(interval.high < 1);
  assert.ok(interval.low < 0.75 && 0.75 < interval.high);
});

test('passPowerCurve exposes reliability ranks beyond pass@1', () => {
  assert.deepEqual(passPowerCurve(0.5, [1, 4, 8]), {
    k1: 0.5,
    k4: 0.0625,
    k8: 0.0039,
  });
});

test('bcaBootstrapMeanInterval is deterministic and contains the observed mean', () => {
  const values = [1, 2, 3, 4, 20];
  const first = bcaBootstrapMeanInterval(values, { iterations: 500, seed: 7 });
  const second = bcaBootstrapMeanInterval(values, { iterations: 500, seed: 7 });
  assert.deepEqual(first, second);
  const observed = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(first.low <= observed && observed <= first.high);
});

test('pairedBinaryComparison compares by world and seed, not raw aggregate order', () => {
  const baseline = [
    { worldId: 'w1', seedIndex: 1, pass: true },
    { worldId: 'w1', seedIndex: 2, pass: false },
    { worldId: 'w1', seedIndex: 3, pass: true },
  ];
  const candidate = [
    { worldId: 'w1', seedIndex: 3, pass: false },
    { worldId: 'w1', seedIndex: 1, pass: true },
    { worldId: 'w1', seedIndex: 2, pass: true },
  ];
  assert.deepEqual(pairedBinaryComparison(baseline, candidate), {
    pairedCount: 3,
    candidateWins: 1,
    baselineWins: 1,
    ties: 1,
    netWins: 0,
    candidateWinRate: 0.5,
  });
});

test('wilson coverage simulation is close to the advertised 95% rate', () => {
  const result = bernoulliCoverageSimulation({ trials: 1000, n: 40, p: 0.6, seed: 10 });
  assert.equal(result.trials, 1000);
  assert.ok(result.coverage >= 0.92 && result.coverage <= 0.98);
});
