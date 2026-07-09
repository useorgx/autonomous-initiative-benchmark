// Run: node --test runner/lib/dimension-independence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertDimensionIndependence,
  buildDimensionIndependenceReport,
  makeSyntheticDimensionAuditEpisodes,
} from './dimension-independence.mjs';

test('synthetic random/degenerate probe has low off-diagonal dimension correlation', () => {
  const episodes = makeSyntheticDimensionAuditEpisodes({ cycles: 2 });
  const report = assertDimensionIndependence(episodes, { maxAbsCorrelation: 0.05 });

  assert.equal(report.ok, true);
  assert.equal(report.rowCount, 256);
  assert.equal(report.maxObservedAbsCorrelation, 0);
  assert.equal(report.pairStats.length, 21);
  assert.equal(report.matrix.outcome.outcome, 1);
  assert.equal(report.matrix.outcome.trust, 0);
});

test('dimension independence audit rejects coupled dimensions', () => {
  const episodes = makeSyntheticDimensionAuditEpisodes({ cycles: 2, coupled: true });
  const report = buildDimensionIndependenceReport(episodes, { maxAbsCorrelation: 0.85 });

  assert.equal(report.ok, false);
  assert.ok(report.coupledPairs.some((pair) => pair.left === 'outcome' && pair.right === 'trust'));
  assert.throws(
    () => assertDimensionIndependence(episodes, { maxAbsCorrelation: 0.85 }),
    /outcome\/trust=1/
  );
});

test('dimension independence audit reports insufficient variance without inventing a pass/fail correlation', () => {
  const episodes = Array.from({ length: 8 }, (_, index) => ({
    episodeId: `constant-${index}`,
    dimensions: { outcome: 1, trust: index % 2, safety: 1 },
  }));
  const report = buildDimensionIndependenceReport(episodes, {
    dimensions: ['outcome', 'trust', 'safety'],
  });

  assert.equal(report.ok, true);
  assert.equal(report.matrix.outcome.trust, null);
  assert.ok(report.warnings.some((warning) => /insufficient variance/.test(warning)));
});
