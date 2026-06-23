// Run: node --test runner/lib/production-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runGate, check } from './production-gate.mjs';

const checks = [
  check('c1', 'correctness', 'blocker', (a) => a.total === 100),
  check('c2', 'brand', 'major', (a) => a.onBrand === true),
  check('c3', 'accessibility', 'major', (a) => ({ pass: a.contrast >= 4.5, value: a.contrast >= 4.5 ? 1 : 0 })),
  check('c4', 'naming', 'minor', (a) => /^[a-z-]+$/.test(a.name ?? '')),
];

test('ships only when all blockers pass AND weighted score >= threshold', () => {
  const perfect = runGate(checks, { total: 100, onBrand: true, contrast: 7, name: 'ok-name' });
  assert.equal(perfect.shipped, true);
  assert.equal(perfect.weightedScore, 1);
  assert.equal(perfect.score, 1);
});

test('a failed BLOCKER blocks shipping even if everything else passes', () => {
  const r = runGate(checks, { total: 999, onBrand: true, contrast: 7, name: 'ok-name' });
  assert.equal(r.shipped, false);
  assert.deepEqual(r.blockersFailed, ['c1']);
  assert.ok(r.score <= 0.3); // blocker-fail caps the candidate score low
});

test('blockers pass but a major fails -> below threshold -> not shipped', () => {
  // c1 blocker(5) pass, c2 major(3) FAIL, c3 major(3) pass, c4 minor(1) pass = 9/12 = 0.75
  const r = runGate(checks, { total: 100, onBrand: false, contrast: 7, name: 'ok-name' });
  assert.equal(r.blockerPass, true);
  assert.equal(r.weightedScore, 0.75);
  assert.equal(r.shipped, false);
  assert.ok(r.score > 0.3 && r.score < 1); // looks-shippable but not actually
});

test('a check that throws counts as failed, not a crash', () => {
  const r = runGate([check('boom', 'x', 'minor', () => { throw new Error('nope'); })], {});
  assert.equal(r.checks[0].pass, false);
  assert.match(r.checks[0].detail, /check threw/);
});

test('byDimension summarizes pass/total per dimension', () => {
  const r = runGate(checks, { total: 100, onBrand: true, contrast: 3, name: 'BadName' });
  assert.equal(r.byDimension.accessibility.passed, 0);
  assert.equal(r.byDimension.naming.passed, 0);
});
