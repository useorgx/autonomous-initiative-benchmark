// Run: node --test runner/lib/run-manifest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadManifestBoundRunConfig,
  resolveManifestBoundRunConfig,
} from './run-manifest.mjs';

const evaluationManifest = {
  id: 'eval-2026-07-08',
  modelManifest: {
    id: 'models-2026-07-08',
    models: [
      {
        id: 'openai/gpt-5.6-high',
        provider: 'openai',
        model: 'gpt-5.6-high',
        pinned: true,
        accessDate: '2026-07-08',
      },
      {
        id: 'anthropic/fable-5',
        provider: 'anthropic',
        model: 'claude-fable-5-20260701',
        pinned: true,
        accessDate: '2026-07-08',
      },
    ],
  },
};

const runManifest = {
  id: 'run-private-holdout-2026-07-08',
  evaluationManifestId: 'eval-2026-07-08',
  contractVersion: 'orgx-bench-v1.1',
  createdAt: '2026-07-08T00:00:00.000Z',
  split: 'private_holdout',
  k: 8,
  modelManifestId: 'models-2026-07-08',
  lossRegistryId: 'loss-registry-v1',
  arms: [
    {
      id: 'raw',
      system: 'single_frontier',
      modelManifestId: 'openai/gpt-5.6-high',
    },
    {
      id: 'orgx',
      system: 'full_orgx',
      modelManifestId: 'openai/gpt-5.6-high',
    },
  ],
  artifactHashes: { corpus: 'sha256:example' },
};

test('loadManifestBoundRunConfig refuses to run without a run manifest', async () => {
  await assert.rejects(
    () => loadManifestBoundRunConfig({ evaluationManifest: 'eval.json' }),
    /--run-manifest is required/
  );
});

test('loadManifestBoundRunConfig refuses to run without an evaluation manifest', async () => {
  await assert.rejects(
    () => loadManifestBoundRunConfig({ runManifest: 'run.json' }),
    /--evaluation-manifest is required/
  );
});

test('resolveManifestBoundRunConfig derives execution config from matching manifests', () => {
  const config = resolveManifestBoundRunConfig({
    runManifest,
    evaluationManifest,
    args: {},
  });

  assert.equal(config.provider, 'openai');
  assert.equal(config.model, 'gpt-5.6-high');
  assert.equal(config.k, 8);
  assert.equal(config.split, 'private_holdout');
  assert.deepEqual(config.arms, ['raw', 'orgx']);
  assert.equal(config.modelManifestEntry.id, 'openai/gpt-5.6-high');
});

test('resolveManifestBoundRunConfig rejects models absent from the model manifest', () => {
  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest,
        evaluationManifest,
        args: { provider: 'openai', model: 'gpt-8-unknown' },
      }),
    /absent from modelManifest.models/
  );
});

test('resolveManifestBoundRunConfig rejects arms outside the run manifest', () => {
  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest,
        evaluationManifest,
        args: { arms: 'raw,secret-arm' },
      }),
    /requested arm\(s\) not declared/
  );
});

test('resolveManifestBoundRunConfig rejects k outside the run manifest', () => {
  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest,
        evaluationManifest,
        args: { k: '16' },
      }),
    /outside run manifest k=8/
  );
});

test('resolveManifestBoundRunConfig requires model selection when arms use different models', () => {
  const mixedManifest = {
    ...runManifest,
    arms: [
      runManifest.arms[0],
      {
        id: 'claude',
        system: 'single_frontier',
        modelManifestId: 'anthropic/fable-5',
      },
    ],
  };

  assert.throws(
    () =>
      resolveManifestBoundRunConfig({
        runManifest: mixedManifest,
        evaluationManifest,
        args: {},
      }),
    /multiple model manifest ids/
  );

  const config = resolveManifestBoundRunConfig({
    runManifest: mixedManifest,
    evaluationManifest,
    args: { modelManifestId: 'anthropic/fable-5', arms: 'claude' },
  });
  assert.equal(config.provider, 'anthropic');
  assert.equal(config.model, 'claude-fable-5-20260701');
  assert.deepEqual(config.arms, ['claude']);
});
