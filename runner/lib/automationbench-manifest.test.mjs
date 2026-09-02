import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { materializeManifest } from '../materialize-automationbench-manifest.mjs';
import { sha256, stableJson } from './automationbench-report.mjs';

test('materializer pins cohort and run bytes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ab-manifest-'));
  try {
    const cohort = {
      schema: 'orgx.automationbench-cohort/v1', split: 'public', cohort_role: 'development_microcanary',
      selection_seed: 'fixture', upstream_commit: 'a'.repeat(40), benchmark_version: '1.0.6', tasks: [{ name: 'sales.fixture', domain: 'sales',
        contract_schema: 'automationbench.task-contract.v1', contract_sha256: 'b'.repeat(64), assertions_total: 1,
        exclusion_policy: { explicit_excluded_indices: [], initially_passing_indices: [], force_scored_indices: [] },
        source_index: 1, evaluation_example_id: 0 }],
    };
    cohort.cohort_sha256 = sha256(stableJson(cohort.tasks));
    const exportBytes = '{"meta":{},"tasks":[]}\n';
    await writeFile(path.join(directory, 'cohort.json'), JSON.stringify(cohort));
    await writeFile(path.join(directory, 'raw.json'), exportBytes);
    const config = { schema: 'orgx.automationbench-experiment-config/v1', cohort_file: 'cohort.json',
      upstream_commit: 'a'.repeat(40), benchmark_version: '1.0.6', toolset: 'api', max_steps: 20, repetitions: 1,
      comparison_kind: 'harness_ablation', baseline_arm: 'raw',
      analysis: { unit: 'task', method: 'stratified_task_cluster_bootstrap', bootstrap_samples: 1000, seed: 'fixture' },
      arms: [
        { id: 'raw', proxy_arm: 'raw', policy_id: 'raw_passthrough', runner_model: 'orgx-ab/raw',
          policy_hash: 'd'.repeat(64), claim_level: 'transport_control', base_model: 'gpt-fixture',
          reasoning_effort: 'medium', runtime_commit: 'c'.repeat(40), fallback_models: [] },
        { id: 'evidence', proxy_arm: 'evidence-gate', policy_id: 'evidence_gate', runner_model: 'orgx-ab/evidence-gate',
          policy_hash: 'e'.repeat(64), claim_level: 'experimental_control_policy', base_model: 'gpt-fixture',
          reasoning_effort: 'medium', runtime_commit: 'c'.repeat(40), fallback_models: [] },
      ],
      runs: [{ arm: 'raw', repetition: 1, file: 'raw.json' }] };
    await writeFile(path.join(directory, 'config.json'), JSON.stringify(config));
    const manifest = await materializeManifest(path.join(directory, 'config.json'));
    assert.equal(manifest.schema, 'orgx.automationbench-comparison/v2');
    assert.equal(manifest.runs[0].sha256, sha256(exportBytes));
    assert.equal(manifest.cohort_sha256, cohort.cohort_sha256);
    assert.equal(manifest.tasks[0].source_index, 1);
    assert.equal(manifest.tasks[0].evaluation_example_id, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
