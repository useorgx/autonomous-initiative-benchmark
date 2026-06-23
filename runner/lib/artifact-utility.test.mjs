// Run: node --test runner/lib/artifact-utility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizedArtifactUtility, aggregateUtility } from './artifact-utility.mjs';
import { consumeWorkbook, GOLD_WORKBOOK, NO_ARTIFACT_SCORE } from '../../worlds/instrumented/reconciliation-workbook-in-use.mjs';

test('NAU: gold = 1.0, no-artifact = 0.0', () => {
  assert.equal(normalizedArtifactUtility({ noArtifact: 0, candidate: 1, gold: 1 }).nau, 1);
  assert.equal(normalizedArtifactUtility({ noArtifact: 0, candidate: 0, gold: 1 }).nau, 0);
});

test('NAU detects a HARMFUL artifact (worse than no artifact)', () => {
  const r = normalizedArtifactUtility({ noArtifact: 0.4, candidate: 0.1, gold: 1 });
  assert.ok(r.nau < 0);
  assert.equal(r.harmful, true);
});

test('NAU null when gold provides no lift', () => {
  assert.equal(normalizedArtifactUtility({ noArtifact: 0.5, candidate: 0.5, gold: 0.5 }).nau, null);
});

test('downstream consumer ACCEPTS the gold workbook', () => {
  const ds = consumeWorkbook(GOLD_WORKBOOK);
  assert.equal(ds.accepted, 1);
  assert.equal(ds.score, 1);
  assert.equal(NO_ARTIFACT_SCORE, 0);
});

test('right total, WRONG lines is rejected (compensating errors caught)', () => {
  // total still 186000 but eta and kappa amounts are swapped-wrong by +/-2000
  const wb = JSON.parse(JSON.stringify(GOLD_WORKBOOK));
  const eta = wb.lines.find((l) => l.customer === 'eta');
  const kappa = wb.lines.find((l) => l.customer === 'kappa');
  eta.annual_recognized -= 2000; // 28000
  kappa.annual_recognized += 2000; // 11600 — total unchanged
  const ds = consumeWorkbook(wb);
  assert.equal(ds.correct, 1, 'total is still correct');
  assert.equal(ds.auditable, 0, 'but lines do not trace to truth');
  assert.equal(ds.accepted, 0, 'so the controller cannot post it');
  assert.equal(ds.score, 0.3); // right number, unusable workbook
});

test('a missing recognized customer is rejected (incomplete workbook)', () => {
  const wb = JSON.parse(JSON.stringify(GOLD_WORKBOOK));
  wb.lines = wb.lines.filter((l) => l.customer !== 'nu'); // drop a real customer
  wb.total_arr = wb.lines.reduce((s, l) => s + l.annual_recognized, 0);
  const ds = consumeWorkbook(wb);
  assert.equal(ds.auditable, 0);
  assert.equal(ds.accepted, 0);
});

test('NAU computed end-to-end from the workbook world', () => {
  const candidate = consumeWorkbook(GOLD_WORKBOOK).score;
  const nau = normalizedArtifactUtility({ noArtifact: NO_ARTIFACT_SCORE, candidate, gold: 1 });
  assert.equal(nau.nau, 1);
  const agg = aggregateUtility([
    { noArtifact: 0, candidate: 1, gold: 1 },
    { noArtifact: 0, candidate: 0.3, gold: 1 },
  ]);
  assert.equal(agg.meanNau, 0.65);
});
