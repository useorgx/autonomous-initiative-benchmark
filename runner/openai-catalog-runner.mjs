#!/usr/bin/env node
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { writeBundle } from './lib/bundle-writer.mjs';
import { DEFAULT_PUBLIC_JUDGE_PANEL, judgeId, parseJudgeSpecs } from './lib/judge-specs.mjs';
import { runOpenAIJudge } from './lib/openai-judge-runner.mjs';
import { runOpenAITask } from './lib/openai-task-runner.mjs';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const DEFAULT_MODEL = process.env.OPENAI_BENCHMARK_MODEL || 'gpt-5-nano';
const DEFAULT_OUTPUT_TOKENS = 3000;
const DEFAULT_MIN_ARTIFACT_CHARS = 700;
const DEFAULT_TIMEOUT_MS = 240_000;

const args = parseArgs(process.argv.slice(2));
const model = args.model || DEFAULT_MODEL;
const preset = args.preset || 'full';
const repeat = Number(args.repeat ?? 1);
const limit = args.limit ? Number(args.limit) : null;
const concurrency = Math.max(1, Number(args.concurrency ?? 1));
const judgeSpecs = parseJudgeSpecs(args.judgeModels ?? '');
const judgeConcurrency = Math.max(1, Number(args.judgeConcurrency ?? 1));
const maxOutputTokens = Number(args.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS);
const judgeMaxOutputTokens = Number(args.judgeMaxOutputTokens ?? 2500);
const minArtifactChars = Number(args.minArtifactChars ?? DEFAULT_MIN_ARTIFACT_CHARS);
const timeoutMs = Number(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
const judgeTimeoutMs = Number(args.judgeTimeoutMs ?? timeoutMs);
const disagreementThresholdPoints = Number(args.judgeDisagreementThreshold ?? 8);
const repoRoot = path.resolve(import.meta.dirname, '..');
const resultId =
  args.out || `local-openai-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 17)}Z`;
const outDir = path.resolve(repoRoot, 'results', resultId);

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required to run the OpenAI catalog benchmark.');
  process.exit(1);
}

if (!Number.isInteger(repeat) || repeat < 1) {
  console.error('--repeat must be a positive integer.');
  process.exit(1);
}

if (!Number.isInteger(concurrency) || concurrency < 1) {
  console.error('--concurrency must be a positive integer.');
  process.exit(1);
}

const tasks = await loadCatalogTasks(repoRoot, preset);
const selectedTasks = limit ? tasks.slice(0, limit) : tasks;
const runs = selectedTasks.flatMap((task) =>
  Array.from({ length: repeat }, (_, index) => ({ task, repeatIndex: index + 1 }))
);

console.log(
  `Running ${runs.length} OpenAI benchmark run(s) across ${selectedTasks.length} task(s) with ${model}.`
);
if (judgeSpecs.length) {
  console.log(
    `Judging each run with ${judgeSpecs
      .map((spec) => `${spec.model}:${spec.reasoningEffort}`)
      .join(', ')}.`
  );
}

const runnerOptions = { model, maxOutputTokens, minArtifactChars, timeoutMs };
const results = await mapWithConcurrency(runs, concurrency, async ({ task, repeatIndex }, index) => {
  const runId = `${task.id}-r${repeatIndex}`;
  console.log(`[${index + 1}/${runs.length}] ${runId}`);
  return runOpenAITask(task, runId, runnerOptions);
});

const judgeRuns = judgeSpecs.length
  ? await runJudges({ tasks: selectedTasks, results, judgeSpecs })
  : [];

await mkdir(outDir, { recursive: true });
await writeBundle({
  repoRoot,
  outDir,
  resultId,
  tasks: selectedTasks,
  results,
  model,
  maxOutputTokens,
  judgeRuns,
  judgeConfig: judgeSpecs.length
    ? {
        judgeSpecs,
        maxOutputTokens: judgeMaxOutputTokens,
        disagreementThresholdPoints,
      }
    : null,
});

console.log(`Wrote benchmark bundle: ${path.relative(repoRoot, outDir)}`);

async function loadCatalogTasks(rootDir, selectedPreset) {
  const tiers = selectedPreset === 'starter' ? ['tier1'] : ['tier1', 'tier2'];
  if (!['starter', 'full'].includes(selectedPreset)) {
    throw new Error(`Unsupported --preset "${selectedPreset}". Use starter or full.`);
  }

  const files = (
    await Promise.all(
      tiers.map(async (tier) => {
        const dir = path.join(rootDir, 'catalog', tier);
        return (await readdir(dir))
          .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
          .sort()
          .map((file) => path.join(dir, file));
      })
    )
  ).flat();

  return Promise.all(
    files.map(async (file) => ({
      file,
      ...parseSimpleYaml(await readFile(file, 'utf8')),
    }))
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

async function runJudges({ tasks, results, judgeSpecs: specs }) {
  const jobs = results.flatMap((result) => {
    const task = tasks.find((candidate) => candidate.id === result.taskId);
    if (!task) throw new Error(`Unknown task for result ${result.runId}: ${result.taskId}`);
    return specs.map((spec, judgeIndex) => ({
      task,
      result,
      judgeSpec: spec,
      judgeId: judgeId(spec, judgeIndex),
    }));
  });

  const judgeOptions = {
    maxOutputTokens: judgeMaxOutputTokens,
    timeoutMs: judgeTimeoutMs,
  };

  return mapWithConcurrency(jobs, judgeConcurrency, async (job, index) => {
    console.log(`[judge ${index + 1}/${jobs.length}] ${job.runId ?? job.result.runId} ${job.judgeId}`);
    return runOpenAIJudge({
      ...job,
      options: {
        ...judgeOptions,
        criterionIds: job.task.acceptanceCriteria.map((criterion) => criterion.id),
      },
    });
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--model') parsed.model = argv[++index];
    else if (arg === '--preset') parsed.preset = argv[++index];
    else if (arg === '--repeat') parsed.repeat = argv[++index];
    else if (arg === '--limit') parsed.limit = argv[++index];
    else if (arg === '--concurrency') parsed.concurrency = argv[++index];
    else if (arg === '--judge-models') parsed.judgeModels = argv[++index];
    else if (arg === '--judge-preset') {
      const preset = argv[++index];
      parsed.judgeModels =
        preset === 'public'
          ? DEFAULT_PUBLIC_JUDGE_PANEL.map((spec) => `${spec.model}:${spec.reasoningEffort}`).join(',')
          : preset;
    }
    else if (arg === '--judge-concurrency') parsed.judgeConcurrency = argv[++index];
    else if (arg === '--max-output-tokens') parsed.maxOutputTokens = argv[++index];
    else if (arg === '--judge-max-output-tokens') parsed.judgeMaxOutputTokens = argv[++index];
    else if (arg === '--min-artifact-chars') parsed.minArtifactChars = argv[++index];
    else if (arg === '--timeout-ms') parsed.timeoutMs = argv[++index];
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
  console.log(`Usage: node runner/openai-catalog-runner.mjs [options]

Options:
  --model <name>              OpenAI model. Defaults to OPENAI_BENCHMARK_MODEL or gpt-5-nano.
  --preset <starter|full>     Catalog subset. Defaults to full.
  --repeat <n>                Runs per task. Defaults to 1.
  --limit <n>                 Limit number of tasks for smoke testing.
  --concurrency <n>           Parallel OpenAI requests. Defaults to 1.
  --judge-preset public       Judge with ${DEFAULT_PUBLIC_JUDGE_PANEL.map((spec) => `${spec.model}:${spec.reasoningEffort}`).join(', ')}.
  --judge-models <list>       Comma-separated judge model specs, e.g. gpt-5.4-nano:low,gpt-5.4:high.
  --judge-concurrency <n>     Parallel judge requests. Defaults to 1.
  --max-output-tokens <n>     Responses API output token cap. Defaults to ${DEFAULT_OUTPUT_TOKENS}.
  --judge-max-output-tokens <n> Judge output token cap. Defaults to 2500.
  --min-artifact-chars <n>    Reject and retry shorter artifacts. Defaults to ${DEFAULT_MIN_ARTIFACT_CHARS}.
  --timeout-ms <n>            Per-request timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --judge-timeout-ms <n>      Per-judge request timeout. Defaults to --timeout-ms.
  --judge-disagreement-threshold <n> Human-review disagreement threshold in quality points. Defaults to 8.
  --out <name>                Result directory name under results/.
`);
}
