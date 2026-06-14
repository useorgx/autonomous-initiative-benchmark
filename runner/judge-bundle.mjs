#!/usr/bin/env node
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { writeBundle } from './lib/bundle-writer.mjs';
import { DEFAULT_PUBLIC_JUDGE_PANEL, JUDGE_PRESETS, judgeId, judgeSpecLabel, parseJudgeSpecs } from './lib/judge-specs.mjs';
import { runOpenAIJudge } from './lib/openai-judge-runner.mjs';
import { requireProviderKey } from './lib/providers.mjs';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const DEFAULT_TIMEOUT_MS = 240_000;
const args = parseArgs(process.argv.slice(2));
const bundleDir = args.bundleDir;
const repoRoot = path.resolve(import.meta.dirname, '..');

if (!bundleDir) {
  console.error('Usage: node runner/judge-bundle.mjs <results/week-dir> [options]');
  process.exit(1);
}

const baseDir = path.resolve(repoRoot, bundleDir);
const outDir = args.out ? path.resolve(repoRoot, 'results', args.out) : baseDir;
const resultId = path.basename(outDir);
const judgeSpecs = parseJudgeSpecs(args.judgeModels ?? 'public');

for (const providerName of new Set(judgeSpecs.map((spec) => spec.provider ?? 'openai'))) {
  try {
    requireProviderKey(providerName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
const judgeConcurrency = Math.max(1, Number(args.judgeConcurrency ?? 1));
const judgeMaxOutputTokens = Number(args.judgeMaxOutputTokens ?? 2500);
const judgeTimeoutMs = Number(args.judgeTimeoutMs ?? DEFAULT_TIMEOUT_MS);
const disagreementThresholdPoints = Number(args.judgeDisagreementThreshold ?? 8);

const [metadata, publishedTasks, examples, priorSummary] = await Promise.all([
  readFile(path.join(baseDir, 'metadata.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'tasks.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'examples.json'), 'utf8').then(JSON.parse),
  readFile(path.join(baseDir, 'summary.json'), 'utf8').then(JSON.parse).catch(() => ({})),
]);
const catalogTasks = await loadCatalogTasks(repoRoot);
const tasks = publishedTasks.map((task) => ({ ...catalogTasks.get(task.id), ...task }));
const results = rebuildResults(tasks, examples);
const model = metadata.generationMethod?.model ?? examples[0]?.model ?? metadata.models?.[0] ?? 'unknown';
const maxOutputTokens = metadata.generationMethod?.maxOutputTokens ?? metadata.assumptions?.maxOutputTokens ?? null;

console.log(
  `Judging ${results.length} run(s) from ${bundleDir} with ${judgeSpecs.map(judgeSpecLabel).join(', ')}.`
);

const jobs = results.flatMap((result) => {
  const task = tasks.find((candidate) => candidate.id === result.taskId);
  if (!task) throw new Error(`Unknown task for result ${result.runId}: ${result.taskId}`);
  return judgeSpecs.map((spec, judgeIndex) => ({
    task,
    result,
    judgeSpec: spec,
    judgeId: judgeId(spec, judgeIndex),
  }));
});

const judgeRuns = await mapWithConcurrency(jobs, judgeConcurrency, async (job, index) => {
  console.log(`[judge ${index + 1}/${jobs.length}] ${job.result.runId} ${job.judgeId}`);
  return runOpenAIJudge({
    ...job,
    options: {
      maxOutputTokens: judgeMaxOutputTokens,
      timeoutMs: judgeTimeoutMs,
      criterionIds: job.task.acceptanceCriteria.map((criterion) => criterion.id),
    },
  });
});

await mkdir(outDir, { recursive: true });
await writeBundle({
  repoRoot,
  outDir,
  resultId,
  tasks,
  results,
  model,
  maxOutputTokens,
  judgeRuns,
  judgeConfig: {
    judgeSpecs,
    maxOutputTokens: judgeMaxOutputTokens,
    disagreementThresholdPoints,
  },
  generationMethod: metadata.generationMethod ?? null,
  source: priorSummary.source ?? 'local_openai_catalog_runner',
});

console.log(`Wrote independent judgments into ${path.relative(repoRoot, outDir)}.`);

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

function rebuildResults(tasks, examples) {
  const exampleByRunId = new Map(examples.map((example) => [example.runId, example]));
  return tasks.flatMap((task) =>
    (task.runs ?? []).map((run) => {
      const example = exampleByRunId.get(run.runId);
      if (!example) throw new Error(`Missing example artifact for run ${run.runId}.`);
      return {
        ...run,
        taskId: task.id,
        provider: example.provider,
        model: example.model,
        artifactMarkdown: example.artifactMarkdown,
        notes: example.notes,
        usage: run.usage ?? {},
        costCents: run.costCents,
      };
    })
  );
}

async function mapWithConcurrency(items, width, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const current = next;
      next += 1;
      output[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return output;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!parsed.bundleDir && !arg.startsWith('--')) parsed.bundleDir = arg;
    else if (arg === '--judge-models') parsed.judgeModels = argv[++index];
    else if (arg === '--judge-preset') parsed.judgeModels = argv[++index];
    else if (arg === '--judge-concurrency') parsed.judgeConcurrency = argv[++index];
    else if (arg === '--judge-max-output-tokens') parsed.judgeMaxOutputTokens = argv[++index];
    else if (arg === '--judge-timeout-ms') parsed.judgeTimeoutMs = argv[++index];
    else if (arg === '--judge-disagreement-threshold') parsed.judgeDisagreementThreshold = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node runner/judge-bundle.mjs <results/week-dir> [options]

Options:
  --judge-preset <name>       public = ${DEFAULT_PUBLIC_JUDGE_PANEL.map(judgeSpecLabel).join(', ')};
                              deepseek = ${JUDGE_PRESETS.deepseek.map(judgeSpecLabel).join(', ')}.
  --judge-models <list>       Comma-separated [provider:]model[:effort] specs, e.g. gpt-5-mini:medium or openrouter:deepseek/deepseek-v4-pro:high.
  --judge-concurrency <n>     Parallel judge requests. Defaults to 1.
  --judge-max-output-tokens <n> Judge output token cap. Defaults to 2500.
  --judge-timeout-ms <n>      Per-judge request timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --judge-disagreement-threshold <n> Human-review disagreement threshold in quality points. Defaults to 8.
  --out <name>                Optional new result directory name under results/.
`);
}
