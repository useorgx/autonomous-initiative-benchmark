// Run: node --test runner/lib/mission-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  qualifiedMissionSuccess,
  didOrchestrate,
  classifyRegime,
  pairByKey,
  rescueHarm,
  unnecessaryOrchestrationRate,
  mechanismDifferential,
  escalationPrecisionRecall,
} from './mission-metrics.mjs';

test('qualified success requires pass AND no critical violation', () => {
  assert.equal(qualifiedMissionSuccess({ pass: true, dimensions: { trust: 1 } }), true);
  // correct value but trust violation (committed corrupted data) -> NOT success
  assert.equal(qualifiedMissionSuccess({ pass: true, dimensions: { trust: 0 } }), false);
  assert.equal(qualifiedMissionSuccess({ pass: false }), false);
  assert.equal(qualifiedMissionSuccess({ pass: true, detail: { criticalViolation: true } }), false);
});

test('didOrchestrate detects a spent verification pass', () => {
  assert.equal(didOrchestrate({ weg: { nodes: [{ type: 'verification_gate', verified: true }] } }), true);
  assert.equal(didOrchestrate({ weg: { nodes: [{ type: 'verification_gate', verified: false }] } }), false);
  assert.equal(didOrchestrate({ weg: { nodes: [{ type: 'best_of_n' }] } }), true);
});

test('classifyRegime buckets by raw success rate', () => {
  assert.equal(classifyRegime(0.95), 'easy');
  assert.equal(classifyRegime(0.5), 'borderline');
  assert.equal(classifyRegime(0.05), 'blocked');
});

test('rescue/harm counted over paired runs', () => {
  const pairs = [
    { raw: { pass: false }, arm: { pass: true, dimensions: {} } }, // rescue
    { raw: { pass: true, dimensions: {} }, arm: { pass: false } }, // harm
    { raw: { pass: true, dimensions: {} }, arm: { pass: true, dimensions: {} } }, // both
  ];
  const rh = rescueHarm(pairs);
  assert.equal(rh.rescueRate, Number((1 / 3).toFixed(4)));
  assert.equal(rh.harmRate, Number((1 / 3).toFixed(4)));
  assert.equal(rh.bothPass, 1);
});

test('unnecessary orchestration = orchestrated on a run raw already passed', () => {
  const pairs = [
    { raw: { pass: true, dimensions: {} }, arm: { pass: true, dimensions: {}, weg: { nodes: [{ type: 'verification_gate', verified: true }] } } },
    { raw: { pass: true, dimensions: {} }, arm: { pass: true, dimensions: {}, weg: { nodes: [] } } },
  ];
  const u = unnecessaryOrchestrationRate(pairs);
  assert.equal(u.rawOk, 2);
  assert.equal(u.orchestratedAnyway, 1);
  assert.equal(u.rate, 0.5);
});

test('mechanism differential is the stressed-minus-clean uplift', () => {
  // arm helps a lot when stressed, not at all when clean -> positive differential
  const d = mechanismDifferential({
    rawClean: [{ pass: true, dimensions: {} }, { pass: true, dimensions: {} }],
    armClean: [{ pass: true, dimensions: {} }, { pass: true, dimensions: {} }],
    rawStressed: [{ pass: false }, { pass: false }],
    armStressed: [{ pass: true, dimensions: {} }, { pass: true, dimensions: {} }],
  });
  assert.equal(d.upliftClean, 0);
  assert.equal(d.upliftStressed, 1);
  assert.equal(d.differential, 1);
});

test('escalation precision/recall from ground-truth shouldEscalate', () => {
  const eps = [
    { terminalKind: 'escalate', id: 'a' }, // correct
    { terminalKind: 'escalate', id: 'b' }, // wrong (shouldn't have)
    { terminalKind: 'submit', id: 'c' }, // missed (should have)
  ];
  const truth = new Set(['a', 'c']);
  const pr = escalationPrecisionRecall(eps, (e) => truth.has(e.id));
  assert.equal(pr.precision, 0.5); // 1 of 2 escalations correct
  assert.equal(pr.recall, 0.5); // 1 of 2 should-escalates caught
});
