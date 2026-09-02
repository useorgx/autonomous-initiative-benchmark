import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorldRunReport } from './world-reporting.mjs';
import { world as ledgerWorld } from '../../worlds/instrumented/ledger-running-total.mjs';

function episode({ arm = 'raw', seedIndex = 1, pass = true, complete = true, tokens = 10, cost = 0.1 } = {}) {
  return {
    episodeId: `${ledgerWorld.id}-${arm}-e${seedIndex}`,
    baseWorldId: ledgerWorld.id,
    worldId: ledgerWorld.id,
    arm,
    seedIndex,
    pass,
    failed: !complete,
    resourceTelemetryComplete: complete,
    dimensions: { outcome: Number(pass), method: 1, trust: null },
    weg: {
      totalTokens: tokens,
      costCents: cost,
      toolCallCount: 1,
      resourceTelemetryComplete: complete,
    },
  };
}

test('unmeasured dimensions stay null and incomplete resource means stay unknown', () => {
  const report = buildWorldRunReport({
    worlds: [ledgerWorld],
    arms: ['raw'],
    k: 2,
    episodes: [episode({ seedIndex: 1 }), episode({ seedIndex: 2, complete: false, tokens: 0, cost: 0 })],
    provider: 'fixture',
    model: 'fixture-model',
  });
  const raw = report.perWorld[0].arms.raw;
  assert.equal(raw.dimensions.trust, null);
  assert.equal(raw.meanTokens, null);
  assert.equal(raw.meanCostCents, null);
  assert.equal(raw.resourceTelemetryComplete, false);
  assert.equal(raw.knownMeanTokenLowerBound, 10);
  assert.equal(raw.knownMeanCostLowerBoundCents, 0.1);
});

test('a sample-perfect raw cell is diagnostic, never declared saturation', () => {
  const report = buildWorldRunReport({
    worlds: [ledgerWorld],
    arms: ['raw'],
    k: 2,
    episodes: [episode({ seedIndex: 1 }), episode({ seedIndex: 2 })],
    provider: 'fixture',
    model: 'fixture-model',
  });
  assert.equal(report.perWorld[0].headroomDiagnostic, 'raw_sample_perfect');
  assert.equal(report.admissionSummary.rawSamplePerfect, 1);
  assert.equal('saturated' in report.admissionSummary, false);
  assert.match(report.admissionSummary.rule, /not a saturation claim/i);
});

test('strict headline mode rejects incomplete resource telemetry', () => {
  const episodes = Array.from({ length: 8 }, (_, index) => episode({
    seedIndex: index + 1,
    complete: index !== 7,
  }));
  assert.throws(() => buildWorldRunReport({
    worlds: [ledgerWorld],
    arms: ['raw'],
    k: 8,
    episodes,
    provider: 'fixture',
    model: 'fixture-model',
    strictHeadline: true,
  }), /resource telemetry|private_holdout/i);
});
