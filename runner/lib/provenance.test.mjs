// Run: node --test runner/lib/provenance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_AUDIT_FIELDS,
  stepProvenanceCompleteness,
  provenanceCompleteness,
  decisionReplayability,
} from './provenance.mjs';

const fullStep = Object.fromEntries(REQUIRED_AUDIT_FIELDS.map((f) => [f, f === 'tool_calls' ? [] : 'x']));

test('a fully-recorded step scores 1.0', () => {
  assert.equal(stepProvenanceCompleteness(fullStep).ratio, 1);
});

test('empty [] counts as a real answer (no tools), not missing', () => {
  const s = { ...fullStep, tool_calls: [] };
  assert.equal(stepProvenanceCompleteness(s).missing.includes('tool_calls'), false);
});

test('a black-box step earns partial credit for what it exposes', () => {
  // e.g. Fugu exposes model+provider+cost+latency tokens but not context/sources
  const blackBox = { run_id: 'r', step_id: 's', model: 'hidden', provider: 'fugu', cost: '1', latency: '2' };
  const c = stepProvenanceCompleteness(blackBox);
  assert.ok(c.ratio > 0 && c.ratio < 1, `expected partial, got ${c.ratio}`);
});

test('run completeness is the mean across steps; no steps scores 0', () => {
  assert.equal(provenanceCompleteness([]).ratio, 0);
  const mixed = provenanceCompleteness([fullStep, { run_id: 'r' }]);
  assert.ok(mixed.ratio > 0 && mixed.ratio < 1);
});

test('replayability: full vs partial vs answer-only', () => {
  assert.equal(decisionReplayability(fullStep), 1);
  assert.equal(decisionReplayability({ decision: 'd' }), 0.5);
  assert.equal(decisionReplayability({}), 0);
});
