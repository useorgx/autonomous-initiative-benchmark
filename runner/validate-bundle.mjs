#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const weekDir = process.argv[2];
if (!weekDir) {
  console.error('Usage: node validate-bundle.mjs <results/week-dir>');
  process.exit(1);
}

const baseDir = path.resolve(process.cwd(), weekDir);
const requiredFiles = ['summary.json', 'metadata.json', 'examples.json', 'tasks.json', 'scorecard.csv'];
for (const file of requiredFiles) {
  try {
    await readFile(path.join(baseDir, file), 'utf8');
  } catch (error) {
    console.error(`Missing required benchmark bundle file: ${file}`);
    process.exit(1);
  }
}

const summary = JSON.parse(await readFile(path.join(baseDir, 'summary.json'), 'utf8'));
const metadata = JSON.parse(await readFile(path.join(baseDir, 'metadata.json'), 'utf8'));

const flow = summary.headlineMetrics?.vs_human_speedup?.value;
const quality = summary.headlineMetrics?.vs_human_quality_delta?.value;

console.log(
  JSON.stringify(
    {
      ok: true,
      benchmarkWeek: summary.benchmarkWeek,
      benchmarkVersion: summary.benchmarkVersion,
      taskCount: metadata.taskCount,
      repeatCount: metadata.repeatCount,
      flowMultiplier: flow,
      qualityDeltaVsHuman: quality,
    },
    null,
    2
  )
);
