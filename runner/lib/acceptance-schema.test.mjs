// Run: node --test runner/lib/acceptance-schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchema, evolveSchema, gateChecks } from './acceptance-schema.mjs';

const base = () => createSchema('design', [
  { id: 'a', dimension: 'accessibility', severity: 'blocker', run: () => true },
  { id: 'b', dimension: 'brand', severity: 'major', run: () => true },
]);

test('createSchema starts at 1.0.0 with provenance + changelog', () => {
  const s = base();
  assert.equal(s.version, '1.0.0');
  assert.equal(s.checks[0].provenance.origin, 'workflow-v1');
  assert.equal(s.changelog.length, 1);
});

test('add_check is a MINOR bump and is sourced', () => {
  const s = evolveSchema(base(), { type: 'add_check', check: { id: 'c', dimension: 'consistency', severity: 'major', run: () => true } }, { source: 'benchmark-finding', reason: 'new failure mode' });
  assert.equal(s.version, '1.1.0');
  assert.equal(s.checks.find((c) => c.id === 'c').provenance.origin, 'benchmark-finding');
  assert.match(s.changelog.at(-1).change, /\+ check c/);
});

test('demote is a PATCH bump and lowers severity', () => {
  const s = evolveSchema(base(), { type: 'demote', id: 'a', toSeverity: 'advisory' }, { source: 'production-override', reason: 'humans keep overriding' });
  assert.equal(s.version, '1.0.1');
  assert.equal(s.checks.find((c) => c.id === 'a').severity, 'advisory');
});

test('remove is a MAJOR bump', () => {
  const s = evolveSchema(base(), { type: 'remove', id: 'b' }, { source: 'production-override', reason: 'wrong check' });
  assert.equal(s.version, '2.0.0');
  assert.equal(s.checks.length, 1);
});

test('gateChecks strips metadata to the runnable shape', () => {
  const gc = gateChecks(base());
  assert.deepEqual(Object.keys(gc[0]).sort(), ['dimension', 'id', 'run', 'severity']);
});
