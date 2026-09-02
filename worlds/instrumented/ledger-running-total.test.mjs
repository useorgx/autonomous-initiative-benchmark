// Deterministic test for the ledger-running-total multi-session world.
// Exercises validate() AND the restart fold logic (the kill-and-resume math)
// without any LLM call. Run: node --test worlds/instrumented/ledger-running-total.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from './ledger-running-total.mjs';

test('validate passes only on the exact ground-truth balance', () => {
  const expected = world.validate({
    terminal: { submission: {} },
    weg: {},
    state: {},
  }).detail.expected;
  const result = world.validate({
    terminal: { kind: 'submit', submission: { balance: expected } },
    weg: { segments: 0 },
    state: { queriedLedger: true },
  });
  assert.equal(result.pass, true);
  assert.equal(result.dimensions.outcome, 1);
});

test('a drifted (wrong) balance fails', () => {
  const result = world.validate({
    terminal: { kind: 'submit', submission: { balance: 999 } },
    weg: { segments: 0 },
    state: { queriedLedger: true },
  });
  assert.equal(result.pass, false);
});

function replayEverySegment(spec) {
  let carry = spec.initCarry();
  const segmentCount = Math.ceil(spec.totalItems / spec.segmentSize);
  const toolCalls = [];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const lo = segment * spec.segmentSize;
    const hi = Math.min(spec.totalItems, lo + spec.segmentSize);
    const tools = spec.segmentTools(carry, lo, hi);
    const segmentRows = tools
      .find((tool) => tool.name === 'get_segment')
      .handler().transactions;
    toolCalls.push({
      segment,
      step: 0,
      name: 'get_segment',
      status: 'succeeded',
    });
    const segmentSum = segmentRows.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );
    const result = tools
      .find((tool) => tool.name === 'submit_segment')
      .handler({ segment_sum: segmentSum });
    toolCalls.push({
      segment,
      step: 1,
      name: 'submit_segment',
      status: 'succeeded',
    });
    carry = spec.foldCarry(carry, result);
  }

  return { carry, segmentCount, toolCalls };
}

test('restart fold over all segments reconstructs the exact balance', () => {
  const spec = world.restart;
  const { carry, segmentCount } = replayEverySegment(spec);
  const expected = world.validate({
    terminal: { submission: {} },
    weg: {},
    state: {},
  }).detail.expected;
  assert.equal(spec.finalSubmission(carry).balance, expected);
  assert.equal(carry.processed, segmentCount);
});

test('restart-derived submission passes only with observed segment-read evidence', () => {
  const spec = world.restart;
  const { carry, segmentCount, toolCalls } = replayEverySegment(spec);
  const weg = { segments: segmentCount, toolCalls };
  const state = spec.deriveValidationState({
    baseState: world.initState(),
    carry,
    weg,
    expectedSegments: segmentCount,
    completedSegments: segmentCount,
  });
  const result = world.validate({
    terminal: { kind: 'submit', submission: spec.finalSubmission(carry) },
    weg,
    state,
  });
  assert.equal(result.pass, true);
  assert.equal(result.dimensions.method, 1);
});

test('correct restart math without observed reads does not earn method evidence', () => {
  const spec = world.restart;
  const { carry, segmentCount } = replayEverySegment(spec);
  const weg = { segments: segmentCount, toolCalls: [] };
  const state = spec.deriveValidationState({
    baseState: world.initState(),
    carry,
    weg,
    expectedSegments: segmentCount,
    completedSegments: segmentCount,
  });
  const result = world.validate({
    terminal: { kind: 'submit', submission: spec.finalSubmission(carry) },
    weg,
    state,
  });
  assert.equal(result.dimensions.outcome, 1);
  assert.equal(result.dimensions.method, 0);
});
