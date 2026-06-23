// Run: node --test worlds/instrumented/analytics-chart-in-use.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeChart, specToSvg, GOLD_CHART } from './analytics-chart-in-use.mjs';
import { normalizedArtifactUtility } from '../../runner/lib/artifact-utility.mjs';

test('gold chart (correct data, honest axis, complete) is ACCEPTED, NAU 1', () => {
  const ds = consumeChart(GOLD_CHART);
  assert.equal(ds.accepted, 1);
  assert.equal(normalizedArtifactUtility({ noArtifact: 0, candidate: ds.score, gold: 1 }).nau, 1);
});

test('TRUNCATED Y-AXIS: correct data but misleading chart scores 0.5, not accepted', () => {
  const misleading = { ...GOLD_CHART, yAxisMin: 80 }; // dramatizes the Mar dip
  const ds = consumeChart(misleading);
  assert.equal(ds.fidelity, 1, 'values are right');
  assert.equal(ds.axisIntegrity, 0, 'but the axis is truncated');
  assert.equal(ds.accepted, 0);
  assert.equal(ds.score, 0.5); // looks-right, unusable
});

test('WRONG AGGREGATION: did not dedup/apply refund -> rejected', () => {
  const wrong = { ...GOLD_CHART, series: GOLD_CHART.series.map((s) => (s.label === 'Mar' ? { ...s, value: 110 } : s.label === 'Feb' ? { ...s, value: 240 } : s)) };
  const ds = consumeChart(wrong);
  assert.equal(ds.fidelity, 0);
  assert.equal(ds.accepted, 0);
});

test('CHERRY-PICK: dropping a month is rejected', () => {
  const cherry = { ...GOLD_CHART, series: GOLD_CHART.series.filter((s) => s.label !== 'Mar') };
  assert.equal(consumeChart(cherry).noCherryPick, 0);
  assert.equal(consumeChart(cherry).accepted, 0);
});

test('specToSvg renders valid SVG with one bar per series', () => {
  const svg = specToSvg(GOLD_CHART);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<rect /g) || []).length, 6);
});
