import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  reconcileAutomationBenchLedger,
  transcriptRootHash,
  parseLedgerJsonl,
  verifyLedgerChain,
} from './automationbench-ledger.mjs';
import { SCHEMA, sha256, stableJson as reportStableJson } from './automationbench-report.mjs';

const messages = [
  { role: 'system', content: 'system' },
  { role: 'user', content: 'do the task' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'api_fetch', arguments: '{}' } }] },
];
const rootHash = transcriptRootHash(messages);
const runtimeCommit = 'c'.repeat(40);
const policyHash = 'd'.repeat(64);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function commitEvents(events) {
  let previous = '0'.repeat(64);
  return events.map((event, index) => {
    const unsigned = { ...event, ledgerSequence: index + 1, prevHash: previous };
    const committed = {
      ...unsigned,
      eventHash: createHash('sha256').update(stableJson(unsigned)).digest('hex'),
    };
    previous = committed.eventHash;
    return committed;
  });
}

function manifest() {
  return {
    schema: SCHEMA,
    upstream_commit: 'a'.repeat(40),
    benchmark_version: '1.0.6',
    split: 'public',
    cohort_role: 'development_microcanary',
    selection_seed: 'fixture',
    cohort_sha256: 'f'.repeat(64),
    toolset: 'api',
    max_steps: 20,
    repetitions: 1,
    comparison_kind: 'harness_ablation',
    baseline_arm: 'raw',
    analysis: { unit: 'task', method: 'stratified_task_cluster_bootstrap', bootstrap_samples: 1000, seed: 'fixture' },
    tasks: [{
      name: 'sales.fixture', domain: 'sales', contract_schema: 'automationbench.task-contract.v1',
      contract_sha256: 'b'.repeat(64), assertions_total: 1,
      exclusion_policy: { explicit_excluded_indices: [], initially_passing_indices: [], force_scored_indices: [] },
    }],
    arms: [
      {
        id: 'raw', proxy_arm: 'raw', policy_id: 'raw_passthrough', policy_hash: policyHash,
        claim_level: 'transport_control', runner_model: 'orgx-ab/raw', base_model: 'gpt-fixture',
        reasoning_effort: 'medium', runtime_commit: runtimeCommit, fallback_models: [],
      },
      {
        id: 'evidence', proxy_arm: 'evidence-gate', policy_id: 'evidence_gate', policy_hash: policyHash,
        claim_level: 'experimental_control_policy', runner_model: 'orgx-ab/evidence-gate', base_model: 'gpt-fixture',
        reasoning_effort: 'medium', runtime_commit: runtimeCommit, fallback_models: [],
      },
    ],
  };
}

function exportData() {
  return {
    meta: { model: 'orgx-ab/raw' },
    tasks: [{ name: 'sales.fixture', messages, input_tokens: 30, output_tokens: 5, cost: 0.01 }],
  };
}

function rawEvents(overrides = {}) {
  const base = {
    schema: 'orgx.automationbench-ledger/v2', runId: 'fixture', at: '2026-09-01T00:00:00Z',
    episodeId: 'abcdef123456', rootHash, arm: 'raw', claimLevel: 'transport_control',
    requestedModel: 'orgx-ab/raw', baseModel: 'gpt-fixture', runtimeCommit, policyHash,
  };
  const events = [
    { ...base, stage: 'primary', providerCallIndex: 1, status: 'succeeded', usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 }, costUsd: 0.006 },
    { ...base, stage: 'policy', status: 'decided', intervene: true, reasons: ['fixture'] },
    { ...base, stage: 'review', providerCallIndex: 2, status: 'succeeded', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }, costUsd: 0.004 },
  ];
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith('event')) Object.assign(events[Number(key.slice(5))], value);
  }
  return events;
}

function ledgerLines(overrides = {}, extra = []) {
  return `${commitEvents([...rawEvents(overrides), ...extra]).map((event) => JSON.stringify(event)).join('\n')}\n`;
}

test('reconciles hash-chained transcript identity, usage, review calls, and all-in cost', () => {
  const result = reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'raw', exportData: exportData(), ledgerBytes: ledgerLines() });
  assert.equal(result.complete, true);
  const receipt = result.costs['sales.fixture'];
  assert.equal(receipt.complete, true);
  assert.equal(receipt.usage_reconciled, true);
  assert.deepEqual(receipt.components.map((component) => component.kind), ['primary', 'verification']);
  assert.equal(receipt.components.reduce((sum, component) => sum + component.usd, 0), 0.01);
  assert.equal(receipt.telemetry.verification_calls, 1);
  assert.equal(result.usageLedgerTailSha256.length, 64);
});

test('review failure keeps observed components but marks telemetry incomplete', () => {
  const base = rawEvents()[0];
  const fallback = {
    ...base,
    at: '2026-09-01T00:00:01Z',
    stage: 'review_fallback',
    status: 'used_primary_candidate',
    telemetryComplete: false,
  };
  const text = ledgerLines({ event2: { status: 'failed', usage: null, costUsd: null } }, [fallback]);
  const data = exportData(); data.tasks[0].input_tokens = 20; data.tasks[0].output_tokens = 3;
  const result = reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'raw', exportData: data, ledgerBytes: text });
  const receipt = result.costs['sales.fixture'];
  assert.equal(receipt.complete, false);
  assert.equal(receipt.telemetry.failed_model_calls, 1);
  assert.equal(receipt.telemetry.review_fallbacks, 1);
});

test('usage mismatch is explicit and cannot become complete cost telemetry', () => {
  const data = exportData(); data.tasks[0].input_tokens = 999;
  const result = reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'raw', exportData: data, ledgerBytes: ledgerLines() });
  assert.equal(result.complete, false);
  assert.equal(result.costs['sales.fixture'].usage_reconciled, false);
  assert.match(result.costs['sales.fixture'].telemetry.reasons.join(' '), /usage mismatch/);
});

test('rejects evaluator/ledger identity drift and root collisions', () => {
  assert.throws(() => reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'evidence', exportData: exportData(), ledgerBytes: ledgerLines() }), /runner model/);
  assert.throws(() => reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'raw', exportData: exportData(), ledgerBytes: ledgerLines({ event0: { baseModel: 'other' } }) }), /base model/);
  assert.throws(() => reconcileAutomationBenchLedger({ manifest: manifest(), armId: 'raw', exportData: exportData(), ledgerBytes: ledgerLines({ event0: { policyHash: 'e'.repeat(64) } }) }), /policy hash/);
  const data = exportData(); data.tasks.push({ ...structuredClone(data.tasks[0]), name: 'sales.duplicate' });
  const m = manifest(); m.tasks.push({ ...structuredClone(m.tasks[0]), name: 'sales.duplicate', contract_sha256: 'e'.repeat(64) });
  m.cohort_sha256 = sha256(reportStableJson(m.tasks));
  assert.throws(() => reconcileAutomationBenchLedger({ manifest: m, armId: 'raw', exportData: data, ledgerBytes: ledgerLines() }), /collision/);
});

test('hash-chain tampering and sequence deletion are rejected', () => {
  const events = parseLedgerJsonl(ledgerLines());
  assert.equal(verifyLedgerChain(events).valid, true);
  events[1].intervene = false;
  assert.equal(verifyLedgerChain(events).valid, false);
  assert.throws(() => reconcileAutomationBenchLedger({
    manifest: manifest(), armId: 'raw', exportData: exportData(),
    ledgerBytes: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  }), /chain/);

  const deleted = parseLedgerJsonl(ledgerLines());
  deleted.splice(1, 1);
  assert.equal(verifyLedgerChain(deleted).valid, false);
});

test('parser rejects malformed JSONL', () => {
  assert.throws(() => parseLedgerJsonl('{}\nnot-json\n'), /line 2/);
});
