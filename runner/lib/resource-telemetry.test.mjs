import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObservedHeadroom, summarizeDimension, summarizeEpisodeResources } from './resource-telemetry.mjs';
import { makeFailedEpisode } from './failed-episode.mjs';

test('incomplete telemetry stays unknown while preserving observed lower bounds', () => {
  const summary = summarizeEpisodeResources([
    { weg: { totalTokens: 100, costCents: 1, resourceTelemetryComplete: true } },
    { weg: { totalTokens: 40, costCents: 0.4, resourceTelemetryComplete: false } },
  ]);
  assert.equal(summary.complete, false);
  assert.equal(summary.meanTokens, null);
  assert.equal(summary.meanCostCents, null);
  assert.equal(summary.knownMeanTokenLowerBound, 70);
  assert.equal(summary.knownMeanCostLowerBoundCents, 0.7);
});

test('unmeasured dimensions remain null rather than aliases for zero', () => {
  assert.deepEqual(summarizeDimension([{ dimensions: { trust: null } }, { dimensions: {} }], 'trust'),
    { value: null, values: [], measuredEpisodes: 0 });
});

test('sample-perfect is explicitly not called saturation', () => {
  assert.equal(classifyObservedHeadroom({ n: 8, passAtK: 1 }), 'raw_sample_perfect');
  assert.equal(classifyObservedHeadroom({ n: 8, passAtK: 0.75 }), 'raw_headroom_observed');
  assert.equal(classifyObservedHeadroom({ n: 0, passAtK: 0 }), 'raw_unobserved');
});

test('top-level failures never look free', () => {
  const episode = makeFailedEpisode({ job: { episodeId: 'x', world: { id: 'w' }, seedIndex: 1, arm: 'raw' }, model: 'm', error: new Error('boom') });
  assert.equal(episode.weg.totalTokens, null);
  assert.equal(episode.weg.costCents, null);
  assert.equal(episode.weg.resourceTelemetryComplete, false);
});
