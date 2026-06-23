// Run: node --test runner/lib/consensus.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalize, majorityVote } from './consensus.mjs';

test('canonicalize is key-order independent', () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
  assert.notEqual(canonicalize({ a: 1 }), canonicalize({ a: 2 }));
});

test('majorityVote picks the modal submission', () => {
  const v = majorityVote([{ total: 186000 }, { total: 186000 }, { total: 999 }]);
  assert.deepEqual(v.submission, { total: 186000 });
  assert.equal(v.votes, 2);
  assert.equal(v.agreement, Number((2 / 3).toFixed(4)));
});

test('majorityVote ignores nulls (failed runs) but counts them in n', () => {
  const v = majorityVote([{ x: 1 }, null, { x: 1 }]);
  assert.equal(v.votes, 2);
  assert.equal(v.n, 3);
  assert.equal(v.agreement, 1); // 2/2 present agree
});

test('all-null -> null consensus', () => {
  assert.equal(majorityVote([null, null]).submission, null);
});

test('ties break to the first-seen submission (deterministic)', () => {
  const v = majorityVote([{ a: 1 }, { b: 2 }]);
  assert.deepEqual(v.submission, { a: 1 });
});
