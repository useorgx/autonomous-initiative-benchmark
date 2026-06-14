#!/usr/bin/env node
// Pairwise preference comparison between two result bundles.
//
// Absolute rubric scoring saturates on the public catalog (most competent
// models hit every criterion, so medians pin at 100 and the benchmark stops
// discriminating). Pairwise judging fixes that: each judge sees both artifacts
// for the same task and must pick the one that satisfies the acceptance
// criteria better. Every pair is judged in both orders to cancel position
// bias, and a pair only counts as a win when both orderings agree.
//
// Usage:
//   node runner/compare-bundles.mjs results/<bundle-a> results/<bundle-b> \
//     [--judge-preset deepseek] [--judge-concurrency 4] \
//     [--max-output-tokens 8000] [--out comparisons.json]
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { JUDGE_PRESETS, judgeSpecLabel, parseJudgeSpecs } from './lib/judge-specs.mjs';
import { chatUsageCostCents, getProvider, normalizeChatUsage, requireProviderKey } from './lib/providers.mjs';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const MAX_ATTEMPTS = 4;
const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');

if (!args.bundleA || !args.bundleB) {
  console.error('Usage: node runner/compare-bundles.mjs <results/bundle-a> <results/bundle-b> [options]');
  process.exit(1);
}

const judgeSpecs = parseJudgeSpecs(args.judgeModels ?? 'deepseek');
for (const providerName of new Set(judgeSpecs.map((spec) => spec.provider ?? 'openai'))) {
  requireProviderKey(providerName);
}
const concurrency = Math.max(1, Number(args.judgeConcurrency ?? 2));
const maxOutputTokens = Number(args.maxOutputTokens ?? 8000);
const timeoutMs = Number(args.timeoutMs ?? 240_000);

const [bundleA, bundleB, catalogTasks] = await Promise.all([
  loadBundle(args.bundleA),
  loadBundle(args.bundleB),
  loadCatalogTasks(repoRoot),
]);

const sharedTaskIds = [...bundleA.byTask.keys()].filter((taskId) => bundleB.byTask.has(taskId));
if (!sharedTaskIds.length) {
  console.error('The two bundles share no task ids.');
  process.exit(1);
}

console.log(
  `Comparing ${sharedTaskIds.length} shared task(s): A=${bundleA.label} vs B=${bundleB.label} with ${judgeSpecs
    .map(judgeSpecLabel)
    .join(', ')} (both orderings per judge).`
);

const jobs = sharedTaskIds.flatMap((taskId) =>
  judgeSpecs.flatMap((judgeSpec, judgeIndex) =>
    ['ab', 'ba'].map((order) => ({ taskId, judgeSpec, judgeIndex, order }))
  )
);

const judgments = await mapWithConcurrency(jobs, concurrency, async (job, index) => {
  console.log(`[compare ${index + 1}/${jobs.length}] ${job.taskId} ${judgeSpecLabel(job.judgeSpec)} order=${job.order}`);
  const task = catalogTasks.get(job.taskId);
  const first = job.order === 'ab' ? bundleA.byTask.get(job.taskId) : bundleB.byTask.get(job.taskId);
  const second = job.order === 'ab' ? bundleB.byTask.get(job.taskId) : bundleA.byTask.get(job.taskId);
  const verdict = await judgePair({ task, first, second, judgeSpec: job.judgeSpec });
  // Map positional winner back to bundle identity.
  const winner =
    verdict.winner === 'tie' ? 'tie' : (verdict.winner === '1') === (job.order === 'ab') ? 'A' : 'B';
  return { ...job, judge: judgeSpecLabel(job.judgeSpec), winner, confidence: verdict.confidence, rationale: verdict.rationale, costCents: verdict.costCents };
});

const perTask = sharedTaskIds.map((taskId) => {
  const taskJudgments = judgments.filter((judgment) => judgment.taskId === taskId);
  const votes = { A: 0, B: 0, tie: 0 };
  for (const judgment of taskJudgments) votes[judgment.winner] += 1;
  // Per-judge consistency: a judge's pair of orderings must agree to count.
  const consistentVotes = { A: 0, B: 0, tie: 0 };
  for (const spec of judgeSpecs) {
    const pair = taskJudgments.filter((judgment) => judgment.judge === judgeSpecLabel(spec));
    const winners = new Set(pair.map((judgment) => judgment.winner));
    consistentVotes[winners.size === 1 ? pair[0].winner : 'tie'] += 1;
  }
  const verdict =
    consistentVotes.A > consistentVotes.B ? 'A' : consistentVotes.B > consistentVotes.A ? 'B' : 'tie';
  return { taskId, votes, consistentVotes, verdict };
});

const summary = {
  bundleA: bundleA.label,
  bundleB: bundleB.label,
  judgePanel: judgeSpecs.map(judgeSpecLabel),
  sharedTasks: sharedTaskIds.length,
  taskVerdicts: {
    A: perTask.filter((task) => task.verdict === 'A').length,
    B: perTask.filter((task) => task.verdict === 'B').length,
    tie: perTask.filter((task) => task.verdict === 'tie').length,
  },
  rawVotes: judgments.reduce(
    (totals, judgment) => ({ ...totals, [judgment.winner]: (totals[judgment.winner] ?? 0) + 1 }),
    {}
  ),
  totalJudgeCostCents: Number(judgments.reduce((total, judgment) => total + (judgment.costCents ?? 0), 0).toFixed(4)),
  perTask,
};

console.log('\nPer-task verdicts (consistent-vote majority):');
for (const task of perTask) {
  console.log(`  ${task.taskId.padEnd(44)} ${task.verdict}  raw=${JSON.stringify(task.votes)}`);
}
console.log(`\nTask-level: A=${summary.taskVerdicts.A} B=${summary.taskVerdicts.B} tie=${summary.taskVerdicts.tie}`);
console.log(`Raw votes: ${JSON.stringify(summary.rawVotes)}  judge cost: ${summary.totalJudgeCostCents}c`);

if (args.out) {
  const outPath = path.resolve(repoRoot, args.out);
  await writeFile(outPath, `${JSON.stringify({ summary, judgments }, null, 2)}\n`, 'utf8');
  console.log(`Wrote comparison report: ${path.relative(repoRoot, outPath)}`);
}

async function judgePair({ task, first, second, judgeSpec }) {
  const providerName = judgeSpec.provider ?? 'openai';
  const provider = getProvider(providerName);
  if (provider.api !== 'chat') throw new Error('compare-bundles.mjs currently supports chat providers only.');
  const apiKey = requireProviderKey(providerName);

  const criteria = task.acceptanceCriteria
    .map((criterion) => `- ${criterion.id} (${criterion.weight}): ${criterion.description}`)
    .join('\n');
  const prompt = [
    'You are an independent benchmark judge comparing two candidate artifacts for the same task.',
    'Pick the artifact that satisfies the weighted acceptance criteria better in substance.',
    'Ignore length, formatting polish, and confident wording unless a criterion requires them.',
    'Declare a tie only when the artifacts are genuinely indistinguishable on the criteria.',
    'Return JSON only, of exactly this shape:',
    '{"winner": "1" | "2" | "tie", "confidence": 0.0, "rationale": "..."}',
    '',
    `Task id: ${task.id}`,
    `Domain: ${task.domain}`,
    '',
    'Original task prompt:',
    task.rawPrompt || task.description,
    '',
    'Acceptance criteria:',
    criteria,
    '',
    '=== ARTIFACT 1 ===',
    first.artifactMarkdown,
    '',
    '=== ARTIFACT 2 ===',
    second.artifactMarkdown,
  ].join('\n');

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: judgeSpec.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          reasoning: { effort: judgeSpec.reasoningEffort },
          max_tokens: maxOutputTokens,
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`${providerName} API ${response.status}: ${body.slice(0, 500)}`);
      const parsed = JSON.parse(body);
      const content = parsed.choices?.[0]?.message?.content ?? '';
      const verdict = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      if (!['1', '2', 'tie'].includes(String(verdict.winner))) {
        throw new Error(`invalid winner: ${JSON.stringify(verdict.winner)}`);
      }
      return {
        winner: String(verdict.winner),
        confidence: Number(verdict.confidence) || 0,
        rationale: String(verdict.rationale || ''),
        usage: normalizeChatUsage(parsed.usage ?? {}),
        costCents: chatUsageCostCents(parsed.usage ?? {}) ?? 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) throw new Error(`pair judgment failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function loadBundle(bundleDir) {
  const baseDir = path.resolve(repoRoot, bundleDir);
  const examples = JSON.parse(await readFile(path.join(baseDir, 'examples.json'), 'utf8'));
  const byTask = new Map();
  for (const example of examples) {
    if (!byTask.has(example.taskId)) byTask.set(example.taskId, example);
  }
  return { label: path.basename(baseDir), byTask };
}

async function loadCatalogTasks(rootDir) {
  const entries = [];
  for (const tier of ['tier1', 'tier2', 'tier3']) {
    const dir = path.join(rootDir, 'catalog', tier);
    for (const file of await readdir(dir).catch(() => [])) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const task = parseSimpleYaml(await readFile(path.join(dir, file), 'utf8'));
      entries.push([task.id, task]);
    }
  }
  return new Map(entries);
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
    if (!arg.startsWith('--')) {
      if (!parsed.bundleA) parsed.bundleA = arg;
      else if (!parsed.bundleB) parsed.bundleB = arg;
    } else if (arg === '--judge-models' || arg === '--judge-preset') parsed.judgeModels = argv[++index];
    else if (arg === '--judge-concurrency') parsed.judgeConcurrency = argv[++index];
    else if (arg === '--max-output-tokens') parsed.maxOutputTokens = argv[++index];
    else if (arg === '--timeout-ms') parsed.timeoutMs = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
  }
  return parsed;
}
