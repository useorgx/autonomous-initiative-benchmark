// Run: node --test runner/lib/initiative-replay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateReplay, splitAtHandoff, scoreContinuation } from './initiative-replay.mjs';

const replay = JSON.parse(
  await readFile(path.resolve(import.meta.dirname, '../../worlds/replays/q3-launch-shadow.example.json'), 'utf8')
);

test('the synthetic replay is well-formed', () => {
  assert.deepEqual(validateReplay(replay), []);
});

test('splitAtHandoff gives the SUT the prefix and hides the continuation', () => {
  const { prefix, suffix } = splitAtHandoff(replay);
  assert.equal(prefix.length, 5);
  assert.equal(suffix.length, 0);
  assert.equal(prefix.at(-1).type, 'handoff');
});

test('a good continuation that preserves state + resolves the blocker is ACCEPTED', () => {
  const r = scoreContinuation(replay, {
    producedArtifacts: ['readiness-checklist', 'launch-comms'],
    resolvedBlockers: ['BLK-load-test'],
    decisions: { scope: 'feature-C-cut' },
    preservedState: replay.carriedState,
    violations: [],
  });
  assert.equal(r.accepted, true);
  assert.equal(r.score, 1);
});

test('continuing GA without the load test green is a forbidden-action failure', () => {
  const r = scoreContinuation(replay, {
    producedArtifacts: ['readiness-checklist', 'launch-comms'],
    resolvedBlockers: [],
    decisions: { scope: 'feature-C-cut' },
    preservedState: replay.carriedState,
    violations: ['ga_without_load_test_green'],
  });
  assert.equal(r.accepted, false);
  assert.ok(r.constraintViolations.includes('ga_without_load_test_green'));
  assert.ok(r.unresolved.includes('BLK-load-test'));
});

test('dropping the carried handoff state (lost the scope decision) is caught', () => {
  const r = scoreContinuation(replay, {
    producedArtifacts: ['readiness-checklist', 'launch-comms'],
    resolvedBlockers: ['BLK-load-test'],
    decisions: { scope: 'feature-C-cut' },
    preservedState: { ...replay.carriedState, scope: 'all-features' }, // silently rescoped
    violations: [],
  });
  assert.equal(r.accepted, false);
  assert.ok(r.droppedState.includes('scope'));
});
