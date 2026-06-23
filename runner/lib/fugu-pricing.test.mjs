// Run: node --test runner/lib/fugu-pricing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { fuguUltraCostCents, orchestrationRatio, fuguCostCents, readFuguUsage } from './fugu-pricing.mjs';

// The exact usage returned by the live Fugu Ultra probe on "140 + 10":
const ULTRA_PROBE = {
  prompt_tokens: 51,
  completion_tokens: 44,
  total_tokens: 995,
  prompt_tokens_details: { cached_tokens: 0, orchestration_input_tokens: 900, orchestration_input_cached_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 0, orchestration_output_tokens: 0 },
};

test('readFuguUsage parses chat-shaped orchestration fields', () => {
  const u = readFuguUsage(ULTRA_PROBE);
  assert.equal(u.input, 51);
  assert.equal(u.orchInput, 900);
  assert.equal(u.total, 995);
});

test('Ultra cost = (input+orchIn)*$5/M + output*$30/M', () => {
  // (51 + 900) * 5/1e6 + 44 * 30/1e6 = 0.004755 + 0.00132 = 0.006075 USD = 0.6075c
  assert.equal(fuguUltraCostCents(ULTRA_PROBE), 0.6075);
});

test('orchestration ratio captures the overhead (900/995 ~= 0.9045)', () => {
  assert.equal(orchestrationRatio(ULTRA_PROBE), Number((900 / 995).toFixed(4)));
});

test('cached tokens are billed at the cheaper rate', () => {
  const usage = { prompt_tokens: 1000, completion_tokens: 0, total_tokens: 1000, prompt_tokens_details: { cached_tokens: 1000, orchestration_input_tokens: 0 }, completion_tokens_details: {} };
  // all 1000 cached -> 1000 * 0.5/1e6 = 0.0005 USD = 0.05c
  assert.equal(fuguUltraCostCents(usage), 0.05);
});

test('fuguCostCents: exact for ultra, null for regular fugu', () => {
  assert.equal(fuguCostCents('fugu-ultra', ULTRA_PROBE), 0.6075);
  assert.equal(fuguCostCents('fugu', ULTRA_PROBE), null);
});
