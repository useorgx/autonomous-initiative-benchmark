// Run: node --test runner/lib/sota-sweep-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSotaSweepPlan, compactSweepPlan } from './sota-sweep-plan.mjs';
import { REQUIRED_RELEASE_ARMS, REQUIRED_RELEASE_METRICS } from './sota-release.mjs';

function releaseManifest(overrides = {}) {
  return {
    releaseId: 'sota-headline-2026-q3',
    frontierSweep: {
      frontierModels: [
        'openai/gpt-5.6-high',
        'openai/gpt-6',
        'anthropic/claude-fable-5',
        'google/gemini-3',
        'deepseek/deepseek-v4-pro',
      ],
      arms: REQUIRED_RELEASE_ARMS,
      minK: 8,
      minEpisodesPerCell: 8,
      metrics: REQUIRED_RELEASE_METRICS,
    },
    ...overrides,
  };
}

function registry(worldCount = 20) {
  return {
    splits: {
      private_holdout: {
        targetWorldCount: worldCount,
        worlds: Array.from({ length: worldCount }, (_, index) => ({
          worldId: `holdout-${index + 1}`,
          status: 'committed_private',
          generatorType: 'parametric',
        })),
      },
    },
  };
}

test('buildSotaSweepPlan expands release manifest into model and human job matrices', () => {
  const plan = buildSotaSweepPlan({ releaseManifest: releaseManifest(), registry: registry() });

  assert.equal(plan.ok, true);
  assert.equal(plan.summary.worldCount, 20);
  assert.equal(plan.summary.frontierModelCount, 5);
  assert.equal(plan.summary.modelArmCount, 8);
  assert.equal(plan.summary.seedsPerCell, 8);
  assert.equal(plan.summary.modelJobCount, 20 * 5 * 8 * 8);
  assert.equal(plan.summary.humanBaselineJobCount, 20 * 3);
  assert.equal(plan.modelJobs.length, plan.summary.modelJobCount);
  assert.equal(plan.humanBaselineJobs.length, plan.summary.humanBaselineJobCount);
  assert.deepEqual(plan.modelJobs[0], {
    jobId: 'sota-headline-2026-q3__holdout-1__openai_gpt-5.6-high__raw__s1',
    releaseId: 'sota-headline-2026-q3',
    worldId: 'holdout-1',
    split: 'private_holdout',
    model: 'openai/gpt-5.6-high',
    arm: 'raw',
    seedIndex: 1,
  });
  assert.equal(plan.humanBaselineJobs[0].arm, 'timed_human');
});

test('compactSweepPlan preserves summary and sample jobs without dumping the full matrix', () => {
  const full = buildSotaSweepPlan({ releaseManifest: releaseManifest(), registry: registry(2) });
  const compact = compactSweepPlan(full);

  assert.equal(compact.summary.modelJobCount, 2 * 5 * 8 * 8);
  assert.equal(compact.modelJobs, undefined);
  assert.equal(compact.samples.firstModelJob.worldId, 'holdout-1');
  assert.equal(compact.samples.lastHumanBaselineJob.worldId, 'holdout-2');
});

test('buildSotaSweepPlan rejects undersized frontier sweeps', () => {
  const plan = buildSotaSweepPlan({
    releaseManifest: releaseManifest({
      frontierSweep: {
        frontierModels: ['openai/gpt-5.6-high'],
        arms: ['raw'],
        minK: 2,
        minEpisodesPerCell: 1,
        metrics: ['pass_at_k'],
      },
    }),
    registry: {
      splits: {
        private_holdout: {
          targetWorldCount: 20,
          worlds: registry(1).splits.private_holdout.worlds,
        },
      },
    },
  });
  const text = plan.errors.join('\n');

  assert.equal(plan.ok, false);
  assert.match(text, /world count 1 is below target/);
  assert.match(text, /frontierModels must include/);
  assert.match(text, /minEpisodesPerCell/);
  assert.match(text, /minK/);
  assert.match(text, /missing required arm orgx_full/);
  assert.match(text, /missing required metric horizon_80/);
});

test('buildSotaSweepPlan rejects duplicate or non-parametric holdout commitments', () => {
  const badRegistry = registry(2);
  badRegistry.splits.private_holdout.worlds[1].worldId = 'holdout-1';
  badRegistry.splits.private_holdout.worlds[1].generatorType = 'fixed';
  const plan = buildSotaSweepPlan({ releaseManifest: releaseManifest(), registry: badRegistry });
  const text = plan.errors.join('\n');

  assert.match(text, /duplicate private_holdout worldId holdout-1/);
  assert.match(text, /must use generatorType=parametric/);
});
