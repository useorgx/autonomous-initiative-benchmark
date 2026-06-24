// Run: node --test runner/lib/loop-scenario.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoopDemo } from './loop-scenario.mjs';

test('the loop monotonically improves grader<->human agreement over 2 iterations', () => {
  const { trail } = runLoopDemo();
  assert.equal(trail.length, 3);
  // 0.33 -> 0.67 -> 1.0, versions 1.0.0 -> 1.0.1 -> 1.1.0
  assert.deepEqual(trail.map((t) => t.version), ['1.0.0', '1.0.1', '1.1.0']);
  assert.ok(trail[0].agreement < trail[1].agreement, 'iter1 improves agreement');
  assert.ok(trail[1].agreement < trail[2].agreement, 'iter2 improves agreement');
  assert.equal(trail[2].agreement, 1);
});

test('iter1 fixes the false-REJECT (cvd-with-cues now ships); iter2 fixes the false-ACCEPT', () => {
  const { trail } = runLoopDemo();
  assert.equal(trail[0].falseRejectRate > 0, true); // v1.0.0 rejects the cues-present palette
  assert.equal(trail[1].falseRejectRate, 0); // iter1 cleared it
  assert.equal(trail[0].falseAcceptRate > 0, true); // v1.0.0 ships the incoherent-states palette
  assert.equal(trail[2].falseAcceptRate, 0); // iter2 cleared it
});

test('each schema change is sourced + a new check count reflects the added gate', () => {
  const { finalSchema, mintedCases } = runLoopDemo();
  assert.equal(finalSchema.checks.length, 13); // 12 + the iter2 gate
  assert.equal(finalSchema.changelog.length, 3);
  assert.equal(finalSchema.changelog[1].source, 'production-override');
  assert.equal(finalSchema.changelog[2].source, 'benchmark-finding');
  assert.equal(mintedCases.length, 2); // overrides became benchmark fixtures
});
