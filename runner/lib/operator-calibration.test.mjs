// Run: node --test runner/lib/operator-calibration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { calibrateGraderVsOperators, operatorMetrics, validateOperatorReview } from './operator-calibration.mjs';

test('calibration surfaces grader OVERSTATEMENT (the METR gap)', () => {
  // grader accepts 8/10, humans accept 4/10; the 4 extra are false-accepts
  const pairs = [
    { automated: true, human: true }, { automated: true, human: true },
    { automated: true, human: true }, { automated: true, human: true },
    { automated: true, human: false }, { automated: true, human: false },
    { automated: true, human: false }, { automated: true, human: false },
    { automated: false, human: false }, { automated: false, human: false },
  ];
  const c = calibrateGraderVsOperators(pairs);
  assert.equal(c.automatedAcceptRate, 0.8);
  assert.equal(c.humanAcceptRate, 0.4);
  assert.equal(c.overstatementPp, 40);
  assert.equal(c.falseAcceptRate, 0.4);
  assert.equal(c.calibrated, false);
});

test('a well-calibrated grader is flagged calibrated', () => {
  const pairs = Array.from({ length: 20 }, (_, i) => ({ automated: i < 10, human: i < 10 }));
  const c = calibrateGraderVsOperators(pairs);
  assert.equal(c.agreement, 1);
  assert.equal(c.cohenKappa, 1);
  assert.equal(c.calibrated, true);
});

test('operator metrics: first-pass acceptance, rework, clarifications, defects', () => {
  const m = operatorMetrics([
    { accepted: true, reworkMinutes: 0, clarifications: 0, defects: 0 },
    { accepted: false, reworkMinutes: 30, clarifications: 2, defects: 1 },
  ]);
  assert.equal(m.firstPassAcceptanceRate, 0.5);
  assert.equal(m.meanReworkMinutes, 15);
  assert.equal(m.defectEscapeRate, 0.5);
});

test('review validation', () => {
  assert.equal(validateOperatorReview({ artifact_id: 'a', operator_id: 'o', accepted: true }), null);
  assert.match(validateOperatorReview({ artifact_id: 'a', operator_id: 'o' }), /accepted/);
});
