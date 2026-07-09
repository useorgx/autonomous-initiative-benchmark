// Run: node --test runner/lib/world-reporting.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertHeadlineStatisticalContract,
  buildWorldRunReport,
} from './world-reporting.mjs';

const publicWorld = { id: 'public-world', domain: 'engineering' };
const holdoutWorld = { id: 'holdout-world', domain: 'engineering', split: 'private_holdout' };

function episode({ worldId = 'holdout-world', arm, seedIndex, pass, difficulty = null }) {
  return {
    episodeId: `${worldId}-${arm}-e${seedIndex}`,
    seedIndex,
    worldId,
    baseWorldId: worldId,
    arm,
    pass,
    difficulty,
    dimensions: {
      outcome: pass ? 1 : 0,
      method: pass ? 1 : 0,
      coordination: pass ? 1 : 0,
      judgment: pass ? 1 : 0,
      trust: pass ? 1 : 0,
    },
    weg: {
      totalTokens: pass ? 100 : 140,
      costCents: pass ? 1 : 1.4,
      toolCallCount: 3,
    },
  };
}

function episodesFor(worldId, arm, passes) {
  return passes.map((pass, index) =>
    episode({ worldId, arm, seedIndex: index + 1, pass })
  );
}

function difficultyEpisodes({ worldId, arm, difficulty, passes }) {
  return passes.map((pass, index) =>
    episode({
      worldId,
      arm,
      seedIndex: index + 1,
      pass,
      difficulty,
    })
  );
}

test('buildWorldRunReport adds CIs, pass^k curve, and paired seed comparisons', () => {
  const report = buildWorldRunReport({
    worlds: [holdoutWorld],
    arms: ['raw', 'orgx'],
    k: 8,
    provider: 'test',
    model: 'test-model',
    episodes: [
      ...episodesFor('holdout-world', 'raw', [true, true, false, false, true, false, false, true]),
      ...episodesFor('holdout-world', 'orgx', [true, true, true, false, true, true, false, true]),
    ],
  });

  const rawStats = report.perWorld[0].arms.raw;
  assert.equal(rawStats.n, 8);
  assert.deepEqual(Object.keys(rawStats.passPowKCurve), ['k1', 'k4', 'k8', 'k16', 'k32']);
  assert.ok(rawStats.passAtKCi95.low < rawStats.passAtK);
  assert.ok(rawStats.passAtK < rawStats.passAtKCi95.high);
  assert.ok(rawStats.meanCostCentsCi95.low <= rawStats.meanCostCents);
  assert.ok(rawStats.meanCostCents <= rawStats.meanCostCentsCi95.high);
  assert.equal(report.pairedComparisons.orgx['holdout-world'].candidateWins, 2);
  assert.equal(report.pairedComparisons.orgx['holdout-world'].baselineWins, 0);
});

test('strict headline mode rejects public worlds', () => {
  assert.throws(
    () =>
      buildWorldRunReport({
        worlds: [publicWorld],
        arms: ['raw'],
        k: 8,
        provider: 'test',
        model: 'test-model',
        strictHeadline: true,
        episodes: episodesFor('public-world', 'raw', [true, true, true, true, true, true, true, true]),
      }),
    /private_holdout/
  );
});

test('strict headline mode rejects n below the minimum', () => {
  const report = buildWorldRunReport({
    worlds: [holdoutWorld],
    arms: ['raw'],
    k: 4,
    provider: 'test',
    model: 'test-model',
    episodes: episodesFor('holdout-world', 'raw', [true, true, true, true]),
  });
  assert.throws(() => assertHeadlineStatisticalContract(report), /k >= 8/);
});

test('strict headline mode passes for private holdout reports with k and CIs', () => {
  const report = buildWorldRunReport({
    worlds: [holdoutWorld],
    arms: ['raw'],
    k: 8,
    provider: 'test',
    model: 'test-model',
    strictHeadline: true,
    episodes: episodesFor('holdout-world', 'raw', [true, true, true, true, true, false, true, true]),
  });
  assert.equal(report.corpus.headlineEligible, true);
});

test('difficulty curves expose reliability horizons and monotonicity', () => {
  const report = buildWorldRunReport({
    worlds: [holdoutWorld],
    arms: ['raw'],
    k: 4,
    provider: 'test',
    model: 'test-model',
    episodes: [
      ...difficultyEpisodes({
        worldId: 'holdout-world',
        arm: 'raw',
        difficulty: { id: 'd1', label: 'easy', difficultyScore: 0.1 },
        passes: [true, true, true, true],
      }),
      ...difficultyEpisodes({
        worldId: 'holdout-world',
        arm: 'raw',
        difficulty: { id: 'd2', label: 'medium', difficultyScore: 0.5 },
        passes: [true, true, true, false],
      }),
      ...difficultyEpisodes({
        worldId: 'holdout-world',
        arm: 'raw',
        difficulty: { id: 'd3', label: 'hard', difficultyScore: 0.9 },
        passes: [true, false, false, false],
      }),
    ],
  });

  const curve = report.difficultyCurves['holdout-world'].raw;
  assert.deepEqual(curve.points.map((point) => point.passAtK), [1, 0.75, 0.25]);
  assert.deepEqual(curve.reliabilityHorizons, { p50: 0.5, p80: 0.1 });
  assert.equal(curve.monotonicity.ok, true);
});

test('difficulty curves flag non-monotone knobs as unproven difficulty', () => {
  const report = buildWorldRunReport({
    worlds: [holdoutWorld],
    arms: ['raw'],
    k: 4,
    provider: 'test',
    model: 'test-model',
    episodes: [
      ...difficultyEpisodes({
        worldId: 'holdout-world',
        arm: 'raw',
        difficulty: { id: 'd1', label: 'easy', difficultyScore: 0.1 },
        passes: [true, false, false, false],
      }),
      ...difficultyEpisodes({
        worldId: 'holdout-world',
        arm: 'raw',
        difficulty: { id: 'd2', label: 'harder', difficultyScore: 0.5 },
        passes: [true, true, true, false],
      }),
    ],
  });

  const curve = report.difficultyCurves['holdout-world'].raw;
  assert.equal(curve.monotonicity.ok, false);
  assert.equal(curve.monotonicity.violations.length, 1);
});
