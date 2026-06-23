// Run: node --test worlds/instrumented/design-tokens-production-in-use.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeTokens, GOLD } from './design-tokens-production-in-use.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

test('GOLD package clears every production gate and ships', () => {
  const r = consumeTokens(GOLD);
  assert.equal(r.shipped, true, `failed: ${JSON.stringify(r.failed)}`);
  assert.equal(r.weightedScore, 1);
});

test('a pure-brand-iris link FAILS (on-brand but not accessible)', () => {
  const a = clone(GOLD);
  a.textColors.light.link = '#6366F1'; // raw iris ~3.6:1 on white
  const r = consumeTokens(a);
  assert.equal(r.shipped, false);
  assert.ok(r.blockersFailed.includes('link-also-accessible'));
});

test('a random dark-blue link FAILS brand trace (accessible but off-brand)', () => {
  const a = clone(GOLD);
  a.textColors.light.link = '#0a3d0a'; // accessible dark green, not in brand family
  const r = consumeTokens(a);
  assert.equal(r.shipped, false);
  assert.ok(r.blockersFailed.includes('link-traces-to-brand'));
});

test('same-lightness red/green statuses FAIL color-blind distinguishability', () => {
  const a = clone(GOLD);
  a.statuses.success.color = '#2e9b2e';
  a.statuses.danger.color = '#d83030';
  const r = consumeTokens(a);
  assert.equal(r.shipped, false);
  assert.ok(r.failed.some((f) => f.id === 'status-cvd-distinguishable'));
});

test('missing focus indicator FAILS (blocker)', () => {
  const a = clone(GOLD);
  a.focus = { color: '#cccccc', thicknessPx: 1 }; // low contrast + too thin
  const r = consumeTokens(a);
  assert.equal(r.shipped, false);
  assert.ok(r.blockersFailed.includes('focus-indicator'));
});

test('claiming AAA while a caption-as-body is too light FAILS overclaim', () => {
  const a = clone(GOLD);
  a.textColors.light.body = '#767676'; // ~4.5:1, AA but not AAA(7)
  a.claims = [{ standard: 'AAA', scope: 'body' }];
  const r = consumeTokens(a);
  // body still passes AA so text-aa holds, but AAA overclaim fails
  assert.ok(r.failed.some((f) => f.id === 'no-aaa-overclaim'));
  assert.equal(r.shipped, false);
});

test('a light-gray caption (common a11y miss) FAILS AA blocker', () => {
  const a = clone(GOLD);
  a.textColors.light.caption = '#aaaaaa'; // ~2.3:1
  const r = consumeTokens(a);
  assert.equal(r.shipped, false);
  assert.ok(r.blockersFailed.includes('text-aa-both-modes'));
});

// Construct validity: a GOOD design in a reasonable alternate SHAPE must ship —
// the gate measures quality, not whether the model matched our exact JSON schema.
test('shape-robust: role->mode nesting still ships', () => {
  const a = clone(GOLD);
  a.textColors = { body: { light: '#1A2030', dark: '#E6E9F0' }, heading: { light: '#0B1020', dark: '#FFFFFF' }, caption: { light: '#595959', dark: '#A7AFBE' }, link: { light: '#4338CA', dark: '#818CF8' } };
  assert.equal(consumeTokens(a).shipped, true);
});

test('shape-robust: statuses-as-array + DTCG {$value} colors still ship', () => {
  const a = clone(GOLD);
  a.statuses = [{ name: 'success', color: { $value: '#1B5E20' }, icon: 'check', label: 'Success' }, { name: 'warning', color: '#E65100', icon: 'alert-triangle', label: 'Warning' }, { name: 'danger', color: '#C2185B', icon: 'x', label: 'Error' }, { name: 'info', color: '#1565C0', icon: 'info-circle', label: 'Info' }];
  assert.equal(consumeTokens(a).shipped, true);
});

test('shape-robust: focus.width + UPPERCASE hex still ships', () => {
  const a = clone(GOLD);
  a.focus = { color: '#1A2030', width: 2 };
  assert.equal(consumeTokens(a).shipped, true);
});

test('generic repeated status labels FAIL use-of-color', () => {
  const a = clone(GOLD);
  for (const s of ['success', 'warning', 'danger', 'info']) { a.statuses[s].label = 'Status'; a.statuses[s].icon = 'circle'; }
  const r = consumeTokens(a);
  assert.ok(r.failed.some((f) => f.id === 'use-of-color-cues'));
});
