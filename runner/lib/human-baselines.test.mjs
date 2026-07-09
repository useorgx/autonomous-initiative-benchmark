// Deterministic test for the human-baseline instrument.
// Run: node --test runner/lib/human-baselines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_BASELINE_MIN_N,
  HUMAN_BASELINE_PROTOCOL_VERSION,
  summarizeHumanBaselines,
  validateHumanBaselineCoverage,
  validateBaselineRecord,
  withHumanBaselines,
} from './human-baselines.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;
const rec = (world_id, human_id, elapsed_seconds, success = true) => ({
  world_id,
  human_id,
  elapsed_seconds,
  success,
});
const recV2 = (world_id, human_id, elapsed_seconds, success = true) => ({
  ...rec(world_id, human_id, elapsed_seconds, success),
  protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
  started_at: '2026-07-08T10:00:00.000Z',
  completed_at: '2026-07-08T10:30:00.000Z',
  artifact_hash: hash('a'),
  receipt_hash: hash('b'),
  operator_profile_hash: hash('c'),
  blind_review_recorded_at: '2026-07-08T10:40:00.000Z',
  grader_verdict_revealed_at: '2026-07-08T10:45:00.000Z',
});

test('validateBaselineRecord catches missing/invalid fields', () => {
  assert.equal(validateBaselineRecord(rec('w', 'h', 10)), null);
  assert.match(validateBaselineRecord({ human_id: 'h', elapsed_seconds: 1, success: true }), /world_id/);
  assert.match(validateBaselineRecord({ world_id: 'w', human_id: 'h', elapsed_seconds: -1, success: true }), /non-negative/);
  assert.match(validateBaselineRecord({ world_id: 'w', human_id: 'h', elapsed_seconds: 1, success: 'yes' }), /boolean/);
  assert.match(
    validateBaselineRecord({ ...recV2('w', 'h', 10), receipt_hash: 'bad' }, { requireProtocol: true }),
    /receipt_hash/
  );
  assert.match(
    validateBaselineRecord(
      {
        ...recV2('w', 'h', 10),
        grader_verdict_revealed_at: '2026-07-08T10:35:00.000Z',
      },
      { requireProtocol: true }
    ),
    /grader_verdict_revealed_at/
  );
});

test('summarize gates headline-eligibility on protocol-complete >= 3 distinct humans', () => {
  const two = summarizeHumanBaselines([recV2('w', 'h1', 30), recV2('w', 'h2', 40)]);
  assert.equal(two.humans, 2);
  assert.equal(two.headline_eligible, false);
  assert.equal(two.minimum_humans, HUMAN_BASELINE_MIN_N);

  const minimalThree = summarizeHumanBaselines([rec('w', 'h1', 30), rec('w', 'h2', 40), rec('w', 'h3', 50)]);
  assert.equal(minimalThree.humans, 3);
  assert.equal(minimalThree.protocol_eligible, false);
  assert.equal(minimalThree.headline_eligible, false);

  const three = summarizeHumanBaselines([recV2('w', 'h1', 30), recV2('w', 'h2', 40), recV2('w', 'h3', 50)]);
  assert.equal(three.humans, 3);
  assert.equal(three.protocol_eligible, true);
  assert.equal(three.headline_eligible, true);
  assert.equal(three.median_seconds, 40);
  assert.equal(three.worlds_with_minimum_humans, 1);
});

test('summarize computes per-world median + success rate', () => {
  const s = summarizeHumanBaselines([
    recV2('a', 'h1', 10, true),
    recV2('a', 'h2', 30, false),
    recV2('b', 'h3', 100, true),
  ]);
  const a = s.per_world.find((w) => w.world_id === 'a');
  assert.equal(a.samples, 2);
  assert.equal(a.humans, 2);
  assert.equal(a.median_seconds, 20);
  assert.equal(a.success_rate, 0.5);
  assert.equal(a.protocol_eligible, false);
});

test('summarize throws on a malformed record (never silently inflates a headline)', () => {
  assert.throws(() => summarizeHumanBaselines([rec('w', 'h', 10), { world_id: 'w' }]), /human baseline\[1\]/);
});

test('withHumanBaselines requires BOTH holdout split AND the human minimum', () => {
  const holdoutReport = { corpus: { headlineEligible: true } };
  // holdout-eligible run + < 3 humans -> NOT headline-eligible
  const under = withHumanBaselines(holdoutReport, [recV2('w', 'h1', 10), recV2('w', 'h2', 10)]);
  assert.equal(under.corpus.headlineEligible, false);
  assert.equal(under.human_baseline_summary.humans, 2);

  // holdout-eligible run + >= 3 humans -> headline-eligible
  const over = withHumanBaselines(holdoutReport, [recV2('w', 'h1', 10), recV2('w', 'h2', 10), recV2('w', 'h3', 10)]);
  assert.equal(over.corpus.headlineEligible, true);

  // public run (not holdout) stays NOT headline-eligible even with humans
  const publicReport = { corpus: { headlineEligible: false } };
  const pub = withHumanBaselines(publicReport, [recV2('w', 'h1', 10), recV2('w', 'h2', 10), recV2('w', 'h3', 10)]);
  assert.equal(pub.corpus.headlineEligible, false);
});

test('validateHumanBaselineCoverage requires protocol-complete baselines on every holdout world', () => {
  const holdoutWorlds = [{ worldId: 'a' }, { worldId: 'b' }];
  const complete = validateHumanBaselineCoverage({
    holdoutWorlds,
    baselines: [
      recV2('a', 'h1', 10),
      recV2('a', 'h2', 12),
      recV2('a', 'h3', 14),
      recV2('b', 'h1', 20),
      recV2('b', 'h2', 22),
      recV2('b', 'h3', 24),
    ],
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.worlds_with_minimum_humans, 2);
  assert.equal(complete.summary.headline_eligible, true);

  const missing = validateHumanBaselineCoverage({
    holdoutWorlds,
    baselines: [recV2('a', 'h1', 10), recV2('a', 'h2', 12), recV2('a', 'h3', 14)],
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing_worlds, ['b']);
  assert.equal(missing.summary.headline_eligible, false);

  const thinProtocol = validateHumanBaselineCoverage({
    holdoutWorlds: [{ worldId: 'a' }],
    baselines: [rec('a', 'h1', 10), rec('a', 'h2', 12), rec('a', 'h3', 14)],
  });
  assert.equal(thinProtocol.ok, false);
  assert.equal(thinProtocol.under_baseline_worlds.length, 1);
  assert.equal(thinProtocol.summary.protocol_eligible, false);
});
