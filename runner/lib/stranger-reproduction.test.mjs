// Run: node --test runner/lib/stranger-reproduction.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STRANGER_REPRODUCTION_PROTOCOL_VERSION,
  summarizeStrangerReproductionReceipt,
  validateStrangerReproductionReceipt,
} from './stranger-reproduction.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function receipt(overrides = {}) {
  return {
    protocol_version: STRANGER_REPRODUCTION_PROTOCOL_VERSION,
    release_id: 'sota-headline-2026-q3',
    reviewer_id: 'external-reviewer-1',
    reviewer_affiliation: 'Independent Eval Lab',
    recorded_at: '2026-07-11T00:00:00.000Z',
    command: 'npm run validate:release -- --strict --manifest results/sota-headline-2026-q3.json',
    public_inputs: [
      {
        path: 'results/sota-headline-2026-q3',
        sha256: hash('a'),
        role: 'headline_bundle',
      },
      {
        path: 'results/sota-headline-2026-q3.json',
        sha256: hash('b'),
        role: 'release_manifest',
      },
    ],
    result_hash: hash('c'),
    bundle_hash: hash('d'),
    release_manifest_hash: hash('e'),
    reproduction_log_hash: hash('f'),
    completed: true,
    matched_to_digit: true,
    deviations: [],
    reproduction_environment: [{ name: 'node', value: '26.x' }],
    ...overrides,
  };
}

test('validateStrangerReproductionReceipt accepts a complete outside reviewer receipt', () => {
  const result = validateStrangerReproductionReceipt(receipt(), { strict: true });

  assert.equal(result.ok, true);
  assert.equal(result.summary.completed, true);
  assert.equal(result.summary.matched_to_digit, true);
  assert.equal(result.summary.public_input_count, 2);
});

test('validateStrangerReproductionReceipt rejects malformed hashes and missing public inputs', () => {
  const result = validateStrangerReproductionReceipt(
    receipt({
      public_inputs: [{ path: 'results/sota-headline-2026-q3', sha256: 'missing', role: 'headline_bundle' }],
      result_hash: 'missing',
    }),
    { strict: true }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /public_inputs\[0\]\.sha256/);
  assert.match(result.errors.join('\n'), /result_hash/);
});

test('strict mode rejects receipts that did not complete and match to the digit', () => {
  const nonStrict = validateStrangerReproductionReceipt(
    receipt({ completed: false, matched_to_digit: false }),
    { strict: false }
  );
  const strict = validateStrangerReproductionReceipt(
    receipt({ completed: false, matched_to_digit: false }),
    { strict: true }
  );

  assert.equal(nonStrict.ok, true);
  assert.match(nonStrict.warnings.join('\n'), /not completed/);
  assert.equal(strict.ok, false);
  assert.match(strict.errors.join('\n'), /not completed/);
  assert.match(strict.errors.join('\n'), /does not match/);
});

test('summarizeStrangerReproductionReceipt exposes only reviewer-safe receipt metadata', () => {
  assert.deepEqual(summarizeStrangerReproductionReceipt(receipt()), {
    protocol_version: STRANGER_REPRODUCTION_PROTOCOL_VERSION,
    release_id: 'sota-headline-2026-q3',
    reviewer_id: 'external-reviewer-1',
    reviewer_affiliation: 'Independent Eval Lab',
    completed: true,
    matched_to_digit: true,
    public_input_count: 2,
    deviation_count: 0,
    recorded_at: '2026-07-11T00:00:00.000Z',
    result_hash: hash('c'),
  });
});
