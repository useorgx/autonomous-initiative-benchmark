// Run: node --test runner/lib/color-science.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaE, simulateCVD, minPairwiseDeltaUnderCVD, labOf } from './color-science.mjs';

test('deltaE: identical = 0, black vs white is large', () => {
  assert.equal(deltaE('#123456', '#123456'), 0);
  assert.ok(deltaE('#000000', '#ffffff') > 95);
});

test('CVD simulation is deterministic and changes red/green', () => {
  const a = simulateCVD('#e53935', 'deuteranopia');
  assert.equal(a, simulateCVD('#e53935', 'deuteranopia'));
  assert.notEqual(a, '#e53935');
});

test('red vs green COLLIDE under deuteranopia (small delta) — the classic trap', () => {
  // a naive same-lightness red/green pair becomes hard to tell apart
  const d = minPairwiseDeltaUnderCVD(['#2e9b2e', '#d83030'], 'deuteranopia');
  assert.ok(d < 20, `expected small delta under deuteranopia, got ${d}`);
});

test('lightness-varied statuses stay distinguishable under all CVD types', () => {
  const statuses = ['#1B5E20', '#FF8F00', '#EF5350', '#5C6BC0'];
  for (const t of ['deuteranopia', 'protanopia', 'tritanopia']) {
    assert.ok(minPairwiseDeltaUnderCVD(statuses, t) >= 12, `${t} too close`);
  }
});
