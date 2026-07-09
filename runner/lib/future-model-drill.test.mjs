// Run: node --test runner/lib/future-model-drill.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFutureModelFireDrillManifests,
  buildFutureModelFireDrillRecord,
} from './future-model-drill.mjs';
import { resolveManifestBoundRunConfig } from './run-manifest.mjs';

const worlds = [
  { id: 'world-a', split: 'public_validation' },
  { id: 'world-b', split: 'public_validation' },
  { id: 'world-private', split: 'private_holdout' },
];

test('future-model fire drill accepts a fake GPT-6 row through manifests only', () => {
  const record = buildFutureModelFireDrillRecord({
    worlds,
    provider: 'openai',
    model: 'gpt-6-fire-drill-stub',
    split: 'public_validation',
    k: 3,
    arms: ['raw', 'orgx'],
    startedAt: '2026-07-08T00:00:00.000Z',
  });

  assert.equal(record.ok, true);
  assert.equal(record.providerApi, 'responses');
  assert.equal(record.modelManifestEntryId, 'openai/gpt-6-fire-drill-stub');
  assert.equal(record.worldCount, 2);
  assert.equal(record.jobCount, 12);
  assert.deepEqual(record.jobs.map((job) => job.episodeId).slice(0, 3), [
    'world-a-raw-e1',
    'world-a-raw-e2',
    'world-a-raw-e3',
  ]);
});

test('future-model fire drill remains provider/model fail-closed', () => {
  const { runManifest, evaluationManifest } = buildFutureModelFireDrillManifests({
    provider: 'openai',
    model: 'gpt-6-fire-drill-stub',
  });

  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest,
        evaluationManifest,
        args: { provider: 'openai', model: 'gpt-7-not-declared' },
      }),
    /absent from modelManifest\.models/
  );

  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest,
        evaluationManifest,
        args: { provider: 'anthropic', model: 'gpt-6-fire-drill-stub' },
      }),
    /requested provider\/model/
  );
});

test('future-model fire drill can target a private-holdout matrix without changing code', () => {
  const record = buildFutureModelFireDrillRecord({
    worlds,
    provider: 'openai',
    model: 'gpt-6-fire-drill-stub',
    split: 'private_holdout',
    k: 2,
    arms: ['raw'],
    startedAt: '2026-07-08T00:00:00.000Z',
  });

  assert.equal(record.split, 'private_holdout');
  assert.equal(record.worldCount, 1);
  assert.equal(record.jobCount, 2);
  assert.equal(record.jobs[0].worldId, 'world-private');
});

