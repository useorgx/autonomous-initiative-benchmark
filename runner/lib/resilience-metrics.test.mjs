// Run: node --test runner/lib/resilience-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recoveryScore,
  withinBudget,
  budgetAdherence,
  uncertaintyHonesty,
} from './resilience-metrics.mjs';

test('recoveryScore: recovered / injected, with per-class breakdown', () => {
  const r = recoveryScore([
    { failureClass: 'provider_outage', injected: true, recovered: true },
    { failureClass: 'provider_outage', injected: true, recovered: false },
    { failureClass: 'context_poisoning', injected: true, recovered: true },
  ]);
  assert.equal(r.ratio, Number((2 / 3).toFixed(4)));
  assert.equal(r.byClass.provider_outage.injected, 2);
  assert.equal(r.byClass.provider_outage.recovered, 1);
});

test('recoveryScore: no injections -> null (not a fake 0 or 1)', () => {
  assert.equal(recoveryScore([]).ratio, null);
});

test('withinBudget: any exceeded dimension fails the run', () => {
  assert.equal(withinBudget({ budget: { tokens: 100 }, consumed: { tokens: 90 } }), true);
  assert.equal(withinBudget({ budget: { tokens: 100 }, consumed: { tokens: 101 } }), false);
  assert.equal(withinBudget({ budget: { dollars: 1, calls: 5 }, consumed: { dollars: 1, calls: 6 } }), false);
});

test('budgetAdherence: fraction of runs that stayed in budget', () => {
  const a = budgetAdherence([
    { budget: { tokens: 100 }, consumed: { tokens: 50 } },
    { budget: { tokens: 100 }, consumed: { tokens: 200 } },
  ]);
  assert.equal(a.ratio, 0.5);
});

test('uncertaintyHonesty: rewards correct abstention, counts false abstentions', () => {
  const u = uncertaintyHonesty([
    { answerable: false, abstained: true },
    { answerable: false, abstained: false },
    { answerable: true, abstained: true },
  ]);
  assert.equal(u.ratio, 0.5);
  assert.equal(u.falseAbstentions, 1);
});
