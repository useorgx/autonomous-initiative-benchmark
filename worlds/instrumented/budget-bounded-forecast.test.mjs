// Deterministic scoring test for the budget-bounded-forecast economy world.
// Run: node --test worlds/instrumented/budget-bounded-forecast.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from './budget-bounded-forecast.mjs';

const wegWith = (n) => ({ toolCalls: Array.from({ length: n }, (_, i) => ({ step: i })) });

test('correct + within budget passes', () => {
  const r = world.validate({ terminal: { kind: 'submit', submission: { forecast: 150 } }, weg: wegWith(3) });
  assert.equal(r.pass, true);
  assert.equal(r.dimensions.outcome, 1);
  assert.equal(r.dimensions.within_budget, 1);
});

test('correct but OVER budget is rejected (the economy penalty)', () => {
  const r = world.validate({ terminal: { kind: 'submit', submission: { forecast: 150 } }, weg: wegWith(9) });
  assert.equal(r.pass, false);
  assert.equal(r.dimensions.outcome, 1);
  assert.equal(r.dimensions.within_budget, 0);
});

test('wrong forecast fails even within budget', () => {
  const r = world.validate({ terminal: { kind: 'submit', submission: { forecast: 200 } }, weg: wegWith(2) });
  assert.equal(r.pass, false);
  assert.equal(r.dimensions.outcome, 0);
});

test('compute tool only allows arithmetic', () => {
  const compute = world.tools.find((t) => t.name === 'compute');
  assert.equal(compute.handler({ expression: '140 + 10' }).result, 150);
  assert.ok(compute.handler({ expression: 'process.exit(1)' }).error);
});
