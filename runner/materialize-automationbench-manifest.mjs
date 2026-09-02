#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, sha256, stableJson, validateManifest } from './lib/automationbench-report.mjs';

export async function materializeManifest(configFile) {
  const absolute = path.resolve(configFile);
  const directory = path.dirname(absolute);
  const config = JSON.parse(await readFile(absolute));
  if (config?.schema !== 'orgx.automationbench-experiment-config/v1') throw new Error('Unsupported experiment config schema');
  const cohort = JSON.parse(await readFile(path.resolve(directory, config.cohort_file)));
  if (cohort?.schema !== 'orgx.automationbench-cohort/v1') throw new Error('Unsupported cohort schema');
  if (cohort.upstream_commit !== config.upstream_commit) throw new Error('Cohort/upstream commit mismatch');
  if (cohort.benchmark_version !== config.benchmark_version) throw new Error('Cohort/benchmark version mismatch');
  const computedCohortSha = sha256(stableJson(cohort.tasks));
  if (computedCohortSha !== cohort.cohort_sha256) throw new Error('Cohort digest mismatch');
  const runs = [];
  for (const run of config.runs ?? []) {
    const exportBytes = await readFile(path.resolve(directory, run.file));
    const item = { arm: run.arm, repetition: run.repetition, file: run.file, sha256: sha256(exportBytes) };
    if (run.costs_file) {
      const costBytes = await readFile(path.resolve(directory, run.costs_file));
      item.costs_file = run.costs_file;
      item.costs_sha256 = sha256(costBytes);
    }
    runs.push(item);
  }
  const manifest = {
    schema: SCHEMA,
    upstream_commit: config.upstream_commit,
    benchmark_version: config.benchmark_version,
    split: cohort.split,
    cohort_role: cohort.cohort_role,
    selection_seed: cohort.selection_seed,
    cohort_sha256: cohort.cohort_sha256,
    toolset: config.toolset,
    max_steps: config.max_steps,
    repetitions: config.repetitions,
    comparison_kind: config.comparison_kind,
    baseline_arm: config.baseline_arm,
    analysis: config.analysis,
    tasks: cohort.tasks,
    arms: config.arms,
    runs,
  };
  validateManifest(manifest);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configFile, outputFile] = process.argv.slice(2);
  if (!configFile || !outputFile) {
    console.error('Usage: node runner/materialize-automationbench-manifest.mjs config.json manifest.json');
    process.exitCode = 2;
  } else {
    try {
      const manifest = await materializeManifest(configFile);
      await writeFile(path.resolve(outputFile), `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`Wrote ${manifest.tasks.length} tasks and ${manifest.runs.length} run exports to ${outputFile}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
