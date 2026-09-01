import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCHEMA, buildAutomationBenchReport as report, sha256 } from './automationbench-report.mjs';
import { compareFromFile } from '../compare-automationbench.mjs';

// Synthetic fixtures test accounting only; these are NOT model benchmark runs.
function fixture() {
  const m = { schema: SCHEMA, upstream_commit: 'a'.repeat(40), benchmark_version: 'fixture',
    split: 'public', toolset: 'api', max_steps: 50, repetitions: 1, comparison_kind: 'harness_ablation', baseline_arm: 'raw',
    tasks: [{ name: 'sales.fixture', domain: 'sales', contract_schema: 'fixture/v1', contract_sha256: 'b'.repeat(64), assertions_total: 2 }],
    arms: ['raw', 'orgx'].map(id => ({ id, model: 'fixture-model', reasoning_effort: 'high', runtime_commit: 'c'.repeat(40), fallback_models: [] })) };
  const inputs = m.arms.map(a => ({ arm: a.id, repetition: 1, data: {
    meta: { model: a.model, reasoning_effort: 'high', toolset: 'api', benchmark_version: 'fixture', max_steps: 50, total_tasks: 1, domains: ['sales'] },
    tasks: [{ name: 'sales.fixture', task_contract_schema: 'fixture/v1', task_contract_sha256: 'b'.repeat(64),
      passed: true, score: 1, assertions_total: 2, assertions_passed: 2,
      assertion_results: [{ passed: true }, { passed: true }], end_state: { updated: true }, cost: 1 }] } }));
  return { m, inputs };
}
function fail(row) { row.passed = false; row.score = 0.5; row.assertions_passed = 1; row.assertion_results[1].passed = false; }
function receipt(extra = []) { return { scope: 'all_model_calls_and_orchestration', complete: true,
  usage_ledger_sha256: 'd'.repeat(64), components: [{ kind: 'primary', model: 'fixture-model', calls: 1, usd: 1 }, ...extra] }; }
const row = (f, i = 0) => f.inputs[i].data.tasks[0];

test('strict pass; no cost or headline claims from native cost alone', () => {
  const f = fixture(); const r = report(f.m, f.inputs);
  assert.equal(r.arms[0].strictPassRate, 1); assert.equal(r.arms[0].costComparable, false);
  assert.equal(r.arms[0].allInCostUsd, null); assert.equal(r.headlineEligible, false);
  assert.equal(r.officialLeaderboardComparable, false);
});
test('partial credit is not success', () => { const f = fixture(); fail(row(f)); const a = report(f.m, f.inputs).arms[0]; assert.equal(a.strictPassRate, 0); assert.equal(a.partialCreditDiagnostic, 0.5); });
test('reject optimistic passed flag', () => { const f = fixture(); row(f).assertion_results[1].passed = false; assert.throws(() => report(f.m, f.inputs), /disagrees/); });
test('zero assertions cannot certify success', () => { const f = fixture(); row(f).assertion_results = []; assert.throws(() => report(f.m, f.inputs), /Unverifiable/); });
test('missing final state cannot certify success', () => { const f = fixture(); row(f).end_state = null; assert.throws(() => report(f.m, f.inputs), /Unverifiable/); });
test('unscored failures retained in denominator', () => { const f = fixture(); fail(row(f)); row(f).assertion_results = []; const a = report(f.m, f.inputs).arms[0]; assert.equal(a.unscoredEpisodes, 1); assert.equal(a.strictPassRate, 0); assert.equal(a.rateIsLowerBound, true); });
test('missing arm yields unknown uplift, not an invented win', () => { const f = fixture(); const r = report(f.m, [f.inputs[1]]); assert.equal(r.arms[0].plannedEpisodes, 1); assert.equal(r.arms[0].missingEpisodes, 1); assert.equal(r.comparisons[0].strictSuccessDelta, null); });
test('missing repetitions retained', () => { const f = fixture(); f.m.repetitions = 2; const a = report(f.m, f.inputs).arms[0]; assert.equal(a.strictPassRate, 0.5); assert.equal(a.allRepetitionsSuccessfulPerTask, 0); assert.equal(a.atLeastOneSuccessPerTask, 1); });
test('pairs report wins and losses', () => { const f = fixture(); fail(row(f)); const c = report(f.m, f.inputs).comparisons[0]; assert.equal(c.pairedWins, 1); assert.equal(c.strictSuccessDelta, 1); });
for (const [name, mutate, pattern] of [
  ['duplicate rows', f => f.inputs[0].data.tasks.push(row(f)), /count|Duplicate/],
  ['duplicate exports', f => f.inputs.push(f.inputs[0]), /Duplicate/],
  ['unknown task', f => { row(f).name = 'sales.other'; }, /Unregistered/],
  ['contract mismatch', f => { row(f).task_contract_sha256 = 'e'.repeat(64); }, /contract mismatch/],
  ['contract schema mismatch', f => { row(f).task_contract_schema = 'different'; }, /contract mismatch/],
  ['changed assertion count', f => { row(f).assertion_results.push({ passed: true }); }, /count mismatch/],
  ['changed exclusions', f => { row(f).assertion_results[1].excluded = true; }, /Unregistered exclusion/],
  ['string truthiness', f => { row(f).assertion_results[1].passed = 'false'; }, /Boolean/],
  ['bad summary count', f => { row(f).assertions_passed = 0; }, /totals disagree/],
  ['different toolset', f => { f.inputs[0].data.meta.toolset = 'zapier'; }, /Metadata mismatch/],
  ['different step budget', f => { f.inputs[0].data.meta.max_steps = 100; }, /Metadata mismatch/],
  ['different version', f => { f.inputs[0].data.meta.benchmark_version = 'other'; }, /Metadata mismatch/],
  ['different model', f => { f.inputs[0].data.meta.model = 'other'; }, /Model\/effort/],
  ['simple cohort', f => { f.m.tasks[0].domain = 'simple'; }, /simple/],
  ['private score claim', f => { f.m.split = 'private_holdout'; }, /public results only/],
  ['mutable upstream', f => { f.m.upstream_commit = 'main'; }, /Pin the upstream/],
  ['mixed-model ablation', f => { f.m.arms[1].model = 'other'; }, /same base model/],
  ['fallback ablation', f => { f.m.arms[1].fallback_models = ['fallback']; }, /separate system/],
  ['empty cohort', f => { f.m.tasks = []; }, /nonempty/],
  ['unregistered repetition', f => { f.inputs[0].repetition = 2; }, /Unexpected repetition/],
]) test(`reject ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => report(f.m, f.inputs), pattern); });

test('registered exclusion respected but never an empty scorer', () => { const f = fixture(); f.m.tasks[0].excluded_indices = [1]; for (const i of f.inputs) { i.data.tasks[0].assertion_results[1].excluded = true; i.data.tasks[0].assertions_total = 1; i.data.tasks[0].assertions_passed = 1; } assert.equal(report(f.m, f.inputs).arms[0].strictPassRate, 1); f.m.tasks[0].excluded_indices = [0, 1]; assert.throws(() => report(f.m, f.inputs), /exclusions/); });
test('all-in costs include fallback', () => { const f = fixture(); f.m.comparison_kind = 'system_comparison'; f.m.arms[1].fallback_models = ['fallback']; f.inputs[1].costs = { 'sales.fixture': receipt([{ kind: 'fallback', model: 'fallback', calls: 2, usd: 3 }]) }; const a = report(f.m, f.inputs).arms[1]; assert.equal(a.allInCostUsd, 4); assert.equal(a.costPerStrictSuccessUsd, 4); });
test('reject undeclared fallback', () => { const f = fixture(); f.inputs[1].costs = { 'sales.fixture': receipt([{ kind: 'fallback', model: 'fallback', calls: 1, usd: 1 }]) }; assert.throws(() => report(f.m, f.inputs), /Undeclared/); });
test('unknown costs stay null, never free', () => { const f = fixture(); f.inputs[0].costs = { 'sales.fixture': { complete: false } }; assert.equal(report(f.m, f.inputs).arms[0].allInCostUsd, null); });
test('zero successes yields null cost per success', () => { const f = fixture(); fail(row(f)); f.inputs[0].costs = { 'sales.fixture': receipt() }; assert.equal(report(f.m, f.inputs).arms[0].costPerStrictSuccessUsd, null); });
test('nonfinite and negative costs rejected', () => { for (const usd of [NaN, Infinity, -1, '1']) { const f = fixture(); const c = receipt(); c.components[0].usd = usd; f.inputs[0].costs = { 'sales.fixture': c }; assert.throws(() => report(f.m, f.inputs), /Invalid cost/); } });
test('all-in costs cannot be lower than native costs', () => { const f = fixture(); const c = receipt(); c.components[0].usd = 0; f.inputs[0].costs = { 'sales.fixture': c }; assert.throws(() => report(f.m, f.inputs), /below native/); });
test('refusal failure retained rather than silently dropped', () => { const f = fixture(); fail(row(f)); row(f).died_on_refusal = true; assert.equal(report(f.m, f.inputs).arms[0].strictSuccesses, 0); });
test('CLI verifies export bytes and handles missing run matrix', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'automationbench-test-'));
  try { const f = fixture(); const data = JSON.stringify(f.inputs[0].data);
    await writeFile(path.join(dir, 'raw.json'), data);
    f.m.runs = [{ arm: 'raw', repetition: 1, file: 'raw.json', sha256: sha256(data) }];
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(f.m));
    const result = await compareFromFile(path.join(dir, 'manifest.json'));
    assert.equal(result.arms[1].missingEpisodes, 1); assert.equal(result.manifestSha256.length, 64);
    await writeFile(path.join(dir, 'raw.json'), data + ' ');
    await assert.rejects(compareFromFile(path.join(dir, 'manifest.json')), /digest mismatch/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
