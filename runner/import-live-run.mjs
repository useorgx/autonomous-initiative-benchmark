#!/usr/bin/env node
// Import artifacts produced by a live OrgX product run (Benchmark Lab, MCP
// delegation, or any external execution surface) into a standard results
// bundle, so the same judging and validation pipeline applies to live-product
// runs and local API smoke runs alike.
//
// Input: a JSON file containing an array of run records:
//   {
//     "taskId": "marketing-launch-brief",   // must match a catalog task id
//     "runId": "marketing-launch-brief-r1",
//     "provider": "orgx",
//     "model": "claude-opus-4-6",
//     "durationSeconds": 312.4,
//     "costCents": 18.2,                     // optional
//     "usage": {},                           // optional, Responses-API shape
//     "autonomousCompleted": true,
//     "artifactMarkdown": "...",
//     "notes": "run_id=..., execution_target=cloud"
//   }
//
// The imported bundle carries no self-reported scores; run judge-bundle.mjs
// (e.g. with --judge-preset deepseek) to produce judged quality scores.
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { writeBundle } from './lib/bundle-writer.mjs';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');

if (!args.input || !args.out) {
  console.error('Usage: node runner/import-live-run.mjs --input <runs.json> --out <result-dir-name> [--source <label>]');
  process.exit(1);
}

const records = JSON.parse(await readFile(path.resolve(args.input), 'utf8'));
if (!Array.isArray(records) || !records.length) {
  console.error('Input must be a non-empty JSON array of run records.');
  process.exit(1);
}

const catalogTasks = await loadCatalogTasks(repoRoot);
const taskIds = [...new Set(records.map((record) => record.taskId))];
const tasks = taskIds.map((taskId) => {
  const task = catalogTasks.get(taskId);
  if (!task) throw new Error(`Run record references unknown catalog task "${taskId}".`);
  return task;
});

const results = records.map((record) => {
  const required = ['taskId', 'runId', 'artifactMarkdown'];
  for (const field of required) {
    if (!record[field]) throw new Error(`Run record is missing "${field}": ${JSON.stringify(record).slice(0, 200)}`);
  }
  const task = catalogTasks.get(record.taskId);
  const emptyScores = Object.fromEntries(task.acceptanceCriteria.map((criterion) => [criterion.id, 0]));
  return {
    runId: record.runId,
    taskId: record.taskId,
    status: 'completed',
    model: record.model ?? 'unknown',
    provider: record.provider ?? 'orgx',
    startedAt: record.startedAt ?? null,
    completedAt: record.completedAt ?? null,
    durationSeconds: Number(record.durationSeconds ?? 0),
    usage: record.usage ?? {},
    costCents: record.costCents ?? null,
    qualityScore: 0,
    completeness: 0,
    autonomousCompleted: record.autonomousCompleted !== false,
    artifactMarkdown: String(record.artifactMarkdown),
    criterionScores: emptyScores,
    selfReportedQualityScore: null,
    selfReportedCompleteness: null,
    selfReportedCriterionScores: null,
    scoringSource: 'unscored_import',
    notes: String(record.notes ?? ''),
  };
});

const models = [...new Set(results.map((result) => result.model))];
const resultId = args.out;
const outDir = path.resolve(repoRoot, 'results', resultId);
await mkdir(outDir, { recursive: true });

await writeBundle({
  repoRoot,
  outDir,
  resultId,
  tasks,
  results,
  model: models.join('+'),
  maxOutputTokens: null,
  generationMethod: {
    provider: results[0].provider,
    model: models.join('+'),
    reasoningEffort: null,
    maxOutputTokens: null,
    surface: args.source ?? 'orgx_live_product',
  },
  source: args.source ?? 'orgx_live_product',
});

console.log(`Imported ${results.length} live run(s) across ${tasks.length} task(s) into results/${resultId}.`);
console.log('Scores are unset; run judge-bundle.mjs on this bundle to produce judged scores.');

async function loadCatalogTasks(rootDir) {
  const files = [];
  for (const tier of ['tier1', 'tier2', 'tier3']) {
    const dir = path.join(rootDir, 'catalog', tier);
    const entries = await readdir(dir).catch(() => []);
    for (const file of entries) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) files.push(path.join(dir, file));
    }
  }
  const entries = await Promise.all(
    files.map(async (file) => {
      const task = parseSimpleYaml(await readFile(file, 'utf8'));
      return [task.id, { file, ...task }];
    })
  );
  return new Map(entries);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') parsed.input = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--source') parsed.source = argv[++index];
  }
  return parsed;
}
