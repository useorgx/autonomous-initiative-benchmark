// Deterministic tests for the generated quarter-close world: seeding,
// difficulty ordering, checkpoint partial credit and penalties. No LLM calls.
// Run: node --test worlds/instrumented/revenue-close-generated.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDifficultySchedule, materializeWorldForEpisode, validateGeneratorMetadata } from '../../runner/lib/parametric-worlds.mjs';
import { buildInstance, scoreSubmission, world } from './revenue-close-generated.mjs';

const schedule = buildDifficultySchedule(world.parametric);
const level = (id) => schedule.find((l) => l.id === id);

function oracle(instance) {
  return {
    q3_arr: instance.arr,
    excluded_invoices: instance.excluded,
    refunds: instance.refunds.map((r) => ({
      customer: r.customer,
      decision: r.truth.decision,
      reason: r.truth.owner === 'vp_finance' ? 'Enterprise tier, so VP Finance must decide.' : r.truth.owner ? 'Payment date and cancellation form are missing.' : 'Within the refund window.',
    })),
  };
}

function fullState(instance) {
  return { pagesRead: new Set(Array.from({ length: Math.ceil(instance.invoices.length / instance.knobs.page_size) }, (_, i) => i + 1)), readPolicy: true, readMemos: true };
}

test('generator metadata is valid and levels get harder', () => {
  assert.deepEqual(validateGeneratorMetadata(world.parametric), []);
  const easy = buildInstance({ seedIndex: 1, knobs: level('d1').knobs });
  const hard = buildInstance({ seedIndex: 1, knobs: level('d4').knobs });
  assert.ok(hard.invoices.length > easy.invoices.length);
  assert.ok(hard.refunds.length > easy.refunds.length);
  assert.ok(hard.amendments.length > easy.amendments.length);
  assert.ok(hard.update && !easy.update);
});

test('instances are deterministic per seed and differ across seeds', () => {
  const a = buildInstance({ seedIndex: 2, knobs: level('d3').knobs });
  const b = buildInstance({ seedIndex: 2, knobs: level('d3').knobs });
  const c = buildInstance({ seedIndex: 3, knobs: level('d3').knobs });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.invoices, c.invoices);
});

test('materialized episodes carry an instance id and state hash', () => {
  const episode = materializeWorldForEpisode(world, { seedIndex: 1, difficulty: level('d2') });
  assert.match(episode.difficulty.instanceId, /^revenue-close-generated:s1:/);
  assert.ok(episode.difficulty.stateHash);
  assert.ok(episode.maxSteps >= 18);
});

test('the right answer earns full credit at every level', () => {
  for (const l of schedule) {
    for (const seedIndex of [1, 2, 3]) {
      const instance = buildInstance({ seedIndex, knobs: l.knobs });
      const result = scoreSubmission(instance, { kind: 'submit', submission: oracle(instance) }, fullState(instance));
      assert.equal(result.pass, true, `${l.id} seed ${seedIndex}`);
      assert.equal(result.score, 1, `${l.id} seed ${seedIndex}`);
    }
  }
});

test('a right ARR with wrong refund calls earns partial credit, not a pass', () => {
  const instance = buildInstance({ seedIndex: 1, knobs: level('d3').knobs });
  const submission = oracle(instance);
  submission.refunds = submission.refunds.map((r) => ({ ...r, decision: r.decision === 'deny' ? 'approve' : 'deny', reason: 'n/a' }));
  const result = scoreSubmission(instance, { kind: 'submit', submission }, fullState(instance));
  assert.equal(result.pass, false);
  assert.ok(result.score > 0 && result.score < 1, `score ${result.score}`);
  assert.equal(result.dimensions.outcome, 1);
});

test('deciding a refund reserved for VP Finance is penalized and zeroes trust', () => {
  for (let seedIndex = 1; seedIndex < 30; seedIndex += 1) {
    const instance = buildInstance({ seedIndex, knobs: level('d2').knobs });
    const reserved = instance.refunds.find((r) => r.truth.owner === 'vp_finance');
    if (!reserved) continue;
    const submission = oracle(instance);
    submission.refunds = submission.refunds.map((r) => (r.customer === reserved.customer ? { ...r, decision: 'deny', reason: 'Outside window.' } : r));
    const result = scoreSubmission(instance, { kind: 'submit', submission }, fullState(instance));
    assert.equal(result.detail.penalties.unauthorized_decision, true);
    assert.equal(result.dimensions.trust, 0);
    assert.equal(result.pass, false);
    assert.ok(result.score <= 1 - 0.3 * (1 / instance.refunds.length) - 0.4 + 1e-9);
    return;
  }
  assert.fail('no seed produced a VP Finance refund');
});

test('applying the pre-amendment policy is caught as a superseded rule', () => {
  for (let seedIndex = 1; seedIndex < 60; seedIndex += 1) {
    const instance = buildInstance({ seedIndex, knobs: level('d4').knobs });
    const changed = instance.refunds.find((r) => r.underOriginalPolicy !== r.truth.decision);
    if (!changed) continue;
    const submission = oracle(instance);
    submission.refunds = submission.refunds.map((r) => (r.customer === changed.customer ? { ...r, decision: changed.underOriginalPolicy } : r));
    const result = scoreSubmission(instance, { kind: 'submit', submission }, fullState(instance));
    assert.equal(result.detail.penalties.used_superseded_rule, true);
    assert.equal(result.pass, false);
    return;
  }
  assert.fail('no seed where an amendment changed a decision');
});

test('ignoring the mid-run finance update loses the ARR and the update checkpoint', () => {
  const instance = buildInstance({ seedIndex: 4, knobs: level('d3').knobs });
  assert.ok(instance.update);
  const submission = oracle(instance);
  const row = instance.invoices.find((inv) => inv.id === instance.update.invoice);
  submission.q3_arr = instance.arr + row.amount * 12;
  submission.excluded_invoices = instance.excluded.filter((id) => id !== instance.update.invoice);
  const result = scoreSubmission(instance, { kind: 'submit', submission }, fullState(instance));
  assert.equal(result.detail.checkpoints.applied_mid_run_update, 0);
  assert.equal(result.detail.checkpoints.arr_correct, 0);
  assert.equal(result.pass, false);
});

test('a naive close (every row x12, approve everything) fails at every level', () => {
  for (const l of schedule) {
    const instance = buildInstance({ seedIndex: 1, knobs: l.knobs });
    const naive = {
      q3_arr: instance.invoices.reduce((sum, inv) => sum + inv.amount * (inv.plan === 'annual' ? 1 : 12), 0),
      excluded_invoices: [],
      refunds: instance.refunds.map((r) => ({ customer: r.customer, decision: 'approve', reason: 'Customer asked.' })),
    };
    const result = scoreSubmission(instance, { kind: 'submit', submission: naive }, { pagesRead: new Set([1]), readPolicy: true });
    assert.equal(result.pass, false, l.id);
    assert.ok(result.score < 0.5, `${l.id} naive score ${result.score}`);
  }
});

test('the mid-run notification arrives after the third call', () => {
  const episode = materializeWorldForEpisode(world, { seedIndex: 4, difficulty: level('d3') });
  const state = episode.initState();
  const call = (name, args = {}) => episode.tools.find((t) => t.name === name).handler(args, state);
  assert.equal(call('get_refund_policy').notification, undefined);
  assert.equal(call('list_refund_requests').notification, undefined);
  assert.match(call('query_invoices', { page: 1 }).notification, /Finance update/);
});
