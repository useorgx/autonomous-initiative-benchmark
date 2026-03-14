#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const weekDir = process.argv[2];
if (!weekDir) {
  console.error('Usage: node recompute-scorecard.mjs <results/week-dir>');
  process.exit(1);
}

const baseDir = path.resolve(process.cwd(), weekDir);
const [summary, metadata, tasks, examples, scorecardCsv] = await Promise.all([
  readFile(path.join(baseDir, 'summary.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'metadata.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'tasks.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'examples.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'scorecard.csv'), 'utf8'),
]);

const rowCount = scorecardCsv
  .trim()
  .split('\n')
  .slice(1)
  .filter(Boolean).length;

console.log(
  JSON.stringify(
    {
      benchmarkWeek: summary.benchmarkWeek,
      benchmarkVersion: summary.benchmarkVersion,
      taskCount: metadata.taskCount,
      repeatCount: metadata.repeatCount,
      domains: metadata.domains,
      providers: metadata.providers,
      models: metadata.models,
      runtimes: metadata.runtimes,
      claims: metadata.claims ?? [],
      publishedTaskCount: Array.isArray(tasks) ? tasks.length : 0,
      exampleCount: Array.isArray(examples) ? examples.length : 0,
      scorecardRowCount: rowCount,
      headlineMetrics: {
        flowMultiplier: summary.headlineMetrics?.vs_human_speedup?.value ?? null,
        qualityDeltaVsHuman:
          summary.headlineMetrics?.vs_human_quality_delta?.value ?? null,
        autonomousCompletionRate:
          summary.headlineMetrics?.autonomous_completion_rate?.value ?? null,
      },
    },
    null,
    2
  )
);
