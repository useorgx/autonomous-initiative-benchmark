// Run: node --test runner/lib/production-checks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio, wcag, requiredFieldsPresent, recomputeMatches, matchesConvention, conventions, provenanceComplete, exactKeySet } from './production-checks.mjs';

test('contrast ratio + WCAG tiers', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(wcag.aaaNormal(contrastRatio('#595959', '#ffffff')), true); // ~7:1
  assert.equal(wcag.aaNormal(contrastRatio('#999999', '#ffffff')), false); // ~2.8:1
  assert.equal(wcag.uiComponent(contrastRatio('#767676', '#ffffff')), true); // >=3
});

test('requiredFieldsPresent reports missing', () => {
  const r = requiredFieldsPresent({ a: 1, b: '' }, ['a', 'b', 'c']);
  assert.equal(r.pass, false);
  assert.deepEqual(r.missing, ['b', 'c']);
});

test('recomputeMatches with tolerance', () => {
  assert.equal(recomputeMatches(100, 101, 2).pass, true);
  assert.equal(recomputeMatches(100, 110, 2).pass, false);
});

test('naming conventions', () => {
  assert.equal(matchesConvention('color-bg-primary', conventions.kebabToken).pass, true);
  assert.equal(matchesConvention('Color_BG', conventions.kebabToken).pass, false);
});

test('provenanceComplete flags ungrounded items', () => {
  const r = provenanceComplete([{ claim: 'x', source: 'factsheet' }, { claim: 'y' }], { allowedSources: ['factsheet'] });
  assert.equal(r.pass, false);
  assert.equal(r.ungrounded.length, 1);
});

test('exactKeySet catches missing and extraneous', () => {
  const r = exactKeySet(['a', 'b', 'z'], ['a', 'b', 'c']);
  assert.deepEqual(r.missing, ['c']);
  assert.deepEqual(r.extra, ['z']);
  assert.equal(r.pass, false);
});
