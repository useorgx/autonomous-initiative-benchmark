// Deterministic test for corpus-split awareness.
// Run: node --test runner/lib/corpus-splits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCorpusEligibility,
  filterWorldsBySplit,
  worldSplit,
} from './corpus-splits.mjs';

test('untagged worlds default to public_validation (safe default)', () => {
  assert.equal(worldSplit({ id: 'w' }), 'public_validation');
  assert.equal(worldSplit({ id: 'w', split: 'private_holdout' }), 'private_holdout');
});

test('a run over in-repo public worlds is NOT headline-eligible', () => {
  const e = computeCorpusEligibility([{ id: 'a' }, { id: 'b', split: 'public_validation' }]);
  assert.equal(e.headlineEligible, false);
  assert.deepEqual(e.splits, ['public_validation']);
  assert.match(e.note, /NOT headline-eligible/);
});

test('a run over only private_holdout worlds IS headline-eligible', () => {
  const e = computeCorpusEligibility([
    { id: 'a', split: 'private_holdout' },
    { id: 'b', split: 'private_holdout' },
  ]);
  assert.equal(e.headlineEligible, true);
});

test('a mixed run is NOT headline-eligible (one public world contaminates)', () => {
  const e = computeCorpusEligibility([
    { id: 'a', split: 'private_holdout' },
    { id: 'b' }, // defaults public
  ]);
  assert.equal(e.headlineEligible, false);
  assert.deepEqual(e.splits, ['private_holdout', 'public_validation']);
});

test('filterWorldsBySplit selects by split, passthrough when unset', () => {
  const worlds = [{ id: 'a', split: 'private_holdout' }, { id: 'b' }];
  assert.equal(filterWorldsBySplit(worlds, 'private_holdout').length, 1);
  assert.equal(filterWorldsBySplit(worlds, 'public_validation').length, 1);
  assert.equal(filterWorldsBySplit(worlds, null).length, 2);
});
