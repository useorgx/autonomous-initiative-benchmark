// Run: node --test worlds/instrumented/domain-artifact-worlds.test.mjs
// Artifact-in-Use coverage across product domains: each gold deliverable is
// ACCEPTED by its deterministic downstream consumer; a plausible-but-bad variant
// is REJECTED for the intended reason; NAU computes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { consumePalette, GOLD_PALETTE, contrastRatio } from './design-accessibility-in-use.mjs';
import { consumeQuery, GOLD_QUERY } from './engineering-query-in-use.mjs';
import { consumeQuote, GOLD_QUOTE } from './sales-quote-in-use.mjs';
import { consumePrioritization, GOLD_PRIORITIZATION } from './product-prioritization-in-use.mjs';
import { consumeClaims, GOLD_CLAIMS } from './marketing-claims-in-use.mjs';
import { normalizedArtifactUtility } from '../../runner/lib/artifact-utility.mjs';

test('DESIGN: gold palette passes WCAG; a low-contrast palette is rejected', () => {
  assert.equal(consumePalette(GOLD_PALETTE).accepted, 1);
  const low = { tokens: { ...GOLD_PALETTE.tokens, body: '#bbbbbb' } }; // light gray on white ~1.5:1
  const ds = consumePalette(low);
  assert.equal(ds.accepted, 0);
  assert.ok(contrastRatio('#bbbbbb', '#ffffff') < 4.5);
});

test('ENGINEERING: gold query returns the truth; a missing-filter query is rejected', () => {
  assert.equal(consumeQuery(GOLD_QUERY).accepted, 1);
  const noStatus = { filters: GOLD_QUERY.filters.filter((f) => f.field !== 'status'), metric: GOLD_QUERY.metric };
  const ds = consumeQuery(noStatus); // includes churned -> 140000
  assert.equal(ds.accepted, 0);
  assert.equal(ds.value, 140000);
});

test('SALES: gold quote accepted; a self-approved 25% discount is an authority violation', () => {
  assert.equal(consumeQuote(GOLD_QUOTE).accepted, 1);
  const overLimit = { ...GOLD_QUOTE, discountPct: 25, total: Math.round(7500 * 0.75), approvedBy: 'rep' };
  const ds = consumeQuote(overLimit);
  assert.equal(ds.correct, 1, 'math is right');
  assert.equal(ds.authorized, 0, 'but discount exceeds rep authority, self-approved');
  assert.equal(ds.accepted, 0);
});

test('PRODUCT: gold prioritization accepted; a ranking that defies its own scores is rejected', () => {
  assert.equal(consumePrioritization(GOLD_PRIORITIZATION).accepted, 1);
  const badRank = { ...GOLD_PRIORITIZATION, ranking: [...GOLD_PRIORITIZATION.ranking].reverse() };
  const ds = consumePrioritization(badRank);
  assert.equal(ds.scoresOk, 1, 'scores are right');
  assert.equal(ds.rankingOk, 0, 'but the ranking does not follow from them');
  assert.equal(ds.accepted, 0);
});

test('MARKETING: gold claims accepted; an exaggerated claim is rejected', () => {
  assert.equal(consumeClaims(GOLD_CLAIMS).accepted, 1);
  const exaggerated = { claims: [{ metric: 'speedup_x', value: 10, text: '10x faster' }, { metric: 'integrations', value: 40 }] };
  const ds = consumeClaims(exaggerated);
  assert.equal(ds.accepted, 0); // 10x != 2x in the fact sheet
});

test('NAU computes for each domain gold (candidate 1, none 0, gold 1 -> NAU 1)', () => {
  for (const score of [consumePalette(GOLD_PALETTE).score, consumeQuery(GOLD_QUERY).score, consumeQuote(GOLD_QUOTE).score, consumePrioritization(GOLD_PRIORITIZATION).score, consumeClaims(GOLD_CLAIMS).score]) {
    assert.equal(normalizedArtifactUtility({ noArtifact: 0, candidate: score, gold: 1 }).nau, 1);
  }
});
