// Run: node --test runner/lib/telemetry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  itemIsMeasured,
  coverageOf,
  publicationSafeUsage,
  costComparable,
  generationTelemetryMissing,
} from './telemetry.mjs';

test('itemIsMeasured: tokens or billed cost count, empty does not', () => {
  assert.equal(itemIsMeasured({ usage: { output_tokens: 10 } }), true);
  assert.equal(itemIsMeasured({ costCents: 4.2 }), true);
  assert.equal(itemIsMeasured({ usage: {} }), false);
  assert.equal(itemIsMeasured({}), false);
});

test('coverageOf: empty list is vacuously full coverage', () => {
  assert.deepEqual(coverageOf([]), { measured: 0, total: 0, ratio: 1 });
});

test('coverageOf: partial coverage is reported as a ratio', () => {
  const c = coverageOf([{ usage: { total_tokens: 5 } }, { usage: {} }]);
  assert.equal(c.measured, 1);
  assert.equal(c.total, 2);
  assert.equal(c.ratio, 0.5);
});

test('publicationSafeUsage: zero-measured becomes null, never zero', () => {
  const safe = publicationSafeUsage(
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, costCents: 0 },
    { measured: 0, total: 15, ratio: 0 }
  );
  assert.equal(safe.totalTokens, null);
  assert.equal(safe.costCents, null);
  assert.equal(safe.coverage, 0);
});

test('publicationSafeUsage: full coverage passes the real numbers through', () => {
  const safe = publicationSafeUsage(
    { inputTokens: 100, outputTokens: 50, totalTokens: 150, costCents: 4 },
    { measured: 15, total: 15, ratio: 1 }
  );
  assert.equal(safe.totalTokens, 150);
  assert.equal(safe.coverage, 1);
});

test('costComparable: requires BOTH surfaces fully measured', () => {
  assert.equal(costComparable({ ratio: 1 }, { ratio: 1 }), true);
  assert.equal(costComparable({ ratio: 0 }, { ratio: 1 }), false);
  assert.equal(costComparable({ ratio: 1 }, { ratio: 0.9 }), false);
});

test('generationTelemetryMissing: catches the zero-cost bundle', () => {
  const bundle = {
    taskCount: 15,
    generationMethod: { model: 'claude-fable-5' },
    tokenUsage: { generation: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
  };
  assert.equal(generationTelemetryMissing(bundle), true);
});

test('generationTelemetryMissing: a real-usage bundle is fine', () => {
  const bundle = {
    taskCount: 15,
    generationMethod: { model: 'claude-fable-5' },
    tokenUsage: { generation: { inputTokens: 21512, outputTokens: 78257, totalTokens: 99769 } },
  };
  assert.equal(generationTelemetryMissing(bundle), false);
});

test('generationTelemetryMissing: already-nulled is not re-flagged (idempotent)', () => {
  const bundle = {
    taskCount: 15,
    generationMethod: { model: 'claude-fable-5' },
    tokenUsage: { generation: { totalTokens: null } },
  };
  assert.equal(generationTelemetryMissing(bundle), false);
});
