// Deterministic test for the ledger-running-total multi-session world.
// Exercises validate() AND the restart fold logic (the kill-and-resume math)
// without any LLM call. Run: node --test worlds/instrumented/ledger-running-total.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from './ledger-running-total.mjs';

test('validate passes only on the exact ground-truth balance', () => {
  // Re-derive the expected balance the same way the world does.
  const r = world.validate({
    terminal: { kind: 'submit', submission: { balance: world.validate({ terminal: { submission: {} }, weg: {}, state: {} }).detail.expected } },
    weg: { segments: 0 },
    state: { queriedLedger: true },
  });
  assert.equal(r.pass, true);
  assert.equal(r.dimensions.outcome, 1);
});

test('a drifted (wrong) balance fails', () => {
  const r = world.validate({
    terminal: { kind: 'submit', submission: { balance: 999 } },
    weg: { segments: 0 },
    state: { queriedLedger: true },
  });
  assert.equal(r.pass, false);
});

test('restart fold over all segments reconstructs the exact balance', () => {
  const spec = world.restart;
  let carry = spec.initCarry();
  const n = Math.ceil(spec.totalItems / spec.segmentSize);
  for (let seg = 0; seg < n; seg += 1) {
    const lo = seg * spec.segmentSize;
    const hi = Math.min(spec.totalItems, lo + spec.segmentSize);
    const tools = spec.segmentTools(carry, lo, hi);
    const segTxns = tools.find((t) => t.name === 'get_segment').handler().transactions;
    const segSum = segTxns.reduce((a, t) => a + t.amount, 0);
    const result = tools.find((t) => t.name === 'submit_segment').handler({ segment_sum: segSum });
    carry = spec.foldCarry(carry, result);
  }
  const expected = world.validate({ terminal: { submission: {} }, weg: {}, state: {} }).detail.expected;
  assert.equal(spec.finalSubmission(carry).balance, expected);
  assert.equal(carry.processed, n);
});

test('restart-derived submission passes validation', () => {
  const spec = world.restart;
  let carry = spec.initCarry();
  const n = Math.ceil(spec.totalItems / spec.segmentSize);
  for (let seg = 0; seg < n; seg += 1) {
    const lo = seg * spec.segmentSize;
    const hi = Math.min(spec.totalItems, lo + spec.segmentSize);
    const tools = spec.segmentTools(carry, lo, hi);
    const segSum = tools.find((t) => t.name === 'get_segment').handler().transactions.reduce((a, t) => a + t.amount, 0);
    carry = spec.foldCarry(carry, { segment_sum: segSum });
  }
  const r = world.validate({ terminal: { submission: spec.finalSubmission(carry) }, weg: { segments: n }, state: {} });
  assert.equal(r.pass, true);
  assert.equal(r.dimensions.method, 1);
});
