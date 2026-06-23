// Run: node --test runner/lib/loop-reconciler.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchema } from './acceptance-schema.mjs';
import { agreement, reconcileFromOverrides, reconcileFromBenchmark } from './loop-reconciler.mjs';

const schema = () => createSchema('design', [
  { id: 'cvd', dimension: 'accessibility', severity: 'major', run: () => true },
  { id: 'contrast', dimension: 'accessibility', severity: 'blocker', run: () => true },
]);

test('agreement measures gate-vs-human and splits false accept/reject', () => {
  const labeled = [
    { artifact: { ok: true }, humanAccept: true },
    { artifact: { ok: false }, humanAccept: false },
    { artifact: { ok: true }, humanAccept: false }, // gate ships, human rejects
  ];
  const a = agreement((art) => art.ok === true, labeled);
  assert.equal(a.agreement, Number((2 / 3).toFixed(4)));
  assert.equal(a.falseAcceptRate, Number((1 / 3).toFixed(4)));
});

test('PRODUCT->BENCHMARK: repeated overrides demote a check + mint fixtures', () => {
  const overrides = [
    { artifactId: 'p1', artifact: { x: 1 }, gateShipped: false, humanAccept: true, attributedCheckId: 'cvd', derived: { kind: 'demote', toSeverity: 'advisory' } },
    { artifactId: 'p2', artifact: { x: 2 }, gateShipped: false, humanAccept: true, attributedCheckId: 'cvd', derived: { kind: 'demote', toSeverity: 'advisory' } },
  ];
  const r = reconcileFromOverrides(schema(), overrides, { minSupport: 2 });
  assert.equal(r.schema.version, '1.0.1');
  assert.equal(r.schema.checks.find((c) => c.id === 'cvd').severity, 'advisory');
  assert.equal(r.mintedCases.length, 2);
  assert.equal(r.mintedCases[0].label, 'human-accept');
});

test('a single override is held (insufficient signal), schema unchanged', () => {
  const r = reconcileFromOverrides(schema(), [{ artifactId: 'p1', artifact: {}, gateShipped: false, humanAccept: true, attributedCheckId: 'cvd' }], { minSupport: 2 });
  assert.equal(r.schema.version, '1.0.0');
  assert.equal(r.decisions[0].action, 'hold');
});

test('a false-accept with no derived check is flagged as a gap (needs derivation)', () => {
  const r = reconcileFromOverrides(schema(), [{ artifactId: 'p9', artifact: {}, gateShipped: true, humanAccept: false, note: 'shipped a misleading chart' }]);
  assert.ok(r.decisions.some((d) => d.action === 'gap-flagged'));
});

test('BENCHMARK->PRODUCT: a finding adds a new production gate', () => {
  const r = reconcileFromBenchmark(schema(), { failureClass: 'focus-equals-link', proposedCheck: { id: 'focus-distinct', dimension: 'accessibility', severity: 'blocker', run: () => true }, evidence: 'live run' });
  assert.equal(r.schema.version, '1.1.0');
  assert.ok(r.schema.checks.some((c) => c.id === 'focus-distinct'));
});
