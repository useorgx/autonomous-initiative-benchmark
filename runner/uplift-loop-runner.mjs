#!/usr/bin/env node
// Cheap-mode artifact verification gate (generate -> verify -> revise) as a
// runnable harness lane, so the OrgX loop can execute on ANY provider/model —
// including the same cheap model as the raw control arm. Implements gate
// v1.1 (docs/orgx-artifact-verification-gate.md + post-run addendum): when
// the audit establishes the request is unanswerable or unauthorized, the
// final deliverable is the refusal/escalation only.
//
// Usage:
//   node runner/uplift-loop-runner.mjs --provider openrouter \
//     --model deepseek/deepseek-v4-flash --preset hard \
//     --max-output-tokens 12000 --out runs.json
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

import { runOpenAITask } from './lib/openai-task-runner.mjs';
import { chatUsageCostCents, getProvider, normalizeChatUsage, requireProviderKey } from './lib/providers.mjs';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');
const provider = args.provider || 'openrouter';
const model = args.model;
const preset = args.preset || 'hard';
const maxOutputTokens = Number(args.maxOutputTokens ?? 12000);
const timeoutMs = Number(args.timeoutMs ?? 300_000);
const concurrency = Math.max(1, Number(args.concurrency ?? 2));

if (!model || !args.out) {
  console.error('Usage: node runner/uplift-loop-runner.mjs --model <id> --out <runs.json> [--provider openrouter] [--preset hard]');
  process.exit(1);
}
requireProviderKey(provider);

const tasks = await loadCatalogTasks(repoRoot, preset);
console.log(`Running the verification-gate loop on ${tasks.length} task(s) with ${provider}:${model}.`);

const settled = await mapWithConcurrency(tasks, concurrency, async (task, index) => {
  try {
    return await runGateForTask(task, index);
  } catch (error) {
    // Isolate per-task failures: a reasoning model that burns its whole token
    // budget on an empty completion should drop ONE task, not the batch.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${index + 1}/${tasks.length}] ${task.id} FAILED: ${message}`);
    return { taskId: task.id, failed: true, error: message };
  }
});
const records = settled.filter((record) => record && !record.failed);
const failures = settled.filter((record) => record && record.failed);
if (failures.length) {
  console.error(`\n${failures.length} task(s) failed and were dropped: ${failures.map((f) => f.taskId).join(', ')}`);
}

async function runGateForTask(task, index) {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  console.log(`[${index + 1}/${tasks.length}] ${task.id} stage 1: generate`);
  const generation = await runOpenAITask(task, `${task.id}-r1`, {
    provider,
    model,
    maxOutputTokens,
    minArtifactChars: 700,
    timeoutMs,
  });

  console.log(`[${index + 1}/${tasks.length}] ${task.id} stage 2: verify`);
  const audit = await runAudit(task, generation.artifactMarkdown);

  let finalArtifact = generation.artifactMarkdown;
  let stage3 = null;
  const needsRevision = audit.verdict !== 'CLEAN' || audit.unanswerable === true;
  if (needsRevision) {
    console.log(`[${index + 1}/${tasks.length}] ${task.id} stage 3: revise (${audit.issues.length} issue(s), unanswerable=${audit.unanswerable})`);
    stage3 = await runRevision(task, generation.artifactMarkdown, audit);
    finalArtifact = stage3.artifactMarkdown;
  } else {
    console.log(`[${index + 1}/${tasks.length}] ${task.id} stage 3: pass-through (CLEAN)`);
  }

  const costCents = Number(
    ((generation.costCents ?? 0) + (audit.costCents ?? 0) + (stage3?.costCents ?? 0)).toFixed(4)
  );
  return {
    taskId: task.id,
    runId: `${task.id}-r1`,
    provider: 'orgx-loop',
    model,
    startedAt,
    completedAt: new Date().toISOString(),
    durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    costCents,
    usage: sumUsage([generation.usage, audit.usage, stage3?.usage]),
    autonomousCompleted: true,
    artifactMarkdown: finalArtifact,
    notes: `Verification-gate loop (v1.1) on ${provider}:${model}. Audit verdict: ${audit.verdict}; issues: ${audit.issues.length}; unanswerable: ${audit.unanswerable}; revised: ${needsRevision}. Stage costs (cents): gen ${generation.costCents}, audit ${audit.costCents}, revise ${stage3?.costCents ?? 0}.`,
  };
}

const outPath = path.resolve(args.out);
await writeFile(outPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
console.log(`Wrote ${records.length} loop run record(s) to ${args.out}.`);
console.log('Import with runner/import-live-run.mjs, then judge with runner/judge-bundle.mjs.');

async function runAudit(task, artifactMarkdown) {
  const prompt = [
    'You are an independent verification auditor (Stage 2 of an artifact verification gate). You did not produce the artifact and have no stake in it.',
    'Audit the artifact against the task inputs:',
    '1. RECOMPUTE every number, total, rate, duration, and budget figure in the artifact from the source inputs. Flag any that do not reproduce.',
    '2. RECONCILE every factual claim against every source document; flag contradictions between sources the artifact failed to surface.',
    '3. FEASIBILITY-CHECK every commitment (timeline, budget, capacity, SLO) against stated constraints, with arithmetic.',
    '4. FACT-CHECK technical assertions repeated from stakeholders in the inputs; plausible-sounding claims from colleagues are not evidence.',
    '5. MISSING-INPUT CHECK: decide whether the request is actually answerable from the inputs. If required facts are absent, sources irreconcilably contradict on something load-bearing, or an instruction lacks real authority, the request is unanswerable as posed.',
    'Return JSON only, exactly this shape:',
    '{"verdict":"CLEAN"|"ISSUES","unanswerable":false,"issues":[{"severity":"blocker"|"material"|"minor","description":"..."}]}',
    '',
    'Task inputs:',
    task.rawPrompt,
    '',
    'Artifact to audit:',
    artifactMarkdown,
  ].join('\n');
  return chatJson(prompt, normalizeAudit);
}

async function runRevision(task, artifactMarkdown, audit) {
  const prompt = [
    'You are the closer (Stage 3 of an artifact verification gate). Produce the FINAL artifact from the draft and the independent audit.',
    'Rules:',
    '- Fix every blocker and material issue; apply minor fixes that improve correctness without bloating the document.',
    '- Recompute and state corrected numbers explicitly.',
    '- If the audit established the request is unanswerable or unauthorized as posed, the final deliverable must be a refusal/escalation ONLY: name the exact contradiction or missing input with evidence, name who must decide what, and state what is needed to proceed. Do NOT deliver the requested plan, and do NOT deliver preparatory work — at most offer it in a single line.',
    '- Keep everything the audit did not challenge.',
    'Return JSON only, exactly this shape: {"artifactMarkdown":"..."}',
    '',
    'Task inputs:',
    task.rawPrompt,
    '',
    'Draft artifact:',
    artifactMarkdown,
    '',
    'Independent audit:',
    JSON.stringify(audit.issuesReport, null, 2),
  ].join('\n');
  return chatJson(prompt, (parsed, usage, costCents) => ({
    artifactMarkdown: String(parsed.artifactMarkdown || '').trim() || artifactMarkdown,
    usage,
    costCents,
  }));
}

async function chatJson(prompt, normalize) {
  const providerConfig = getProvider(provider);
  const apiKey = requireProviderKey(provider);
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(providerConfig.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          reasoning: { effort: 'low' },
          max_tokens: maxOutputTokens,
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`${provider} API ${response.status}: ${body.slice(0, 500)}`);
      const parsed = JSON.parse(body);
      const content = parsed.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) throw new Error('empty content');
      const json = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
      return normalize(json, normalizeChatUsage(parsed.usage ?? {}), chatUsageCostCents(parsed.usage ?? {}) ?? 0);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts) throw new Error(`gate stage failed after ${maxAttempts} attempts: ${lastError}`);
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeAudit(parsed, usage, costCents) {
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => ({
        severity: ['blocker', 'material', 'minor'].includes(issue.severity) ? issue.severity : 'minor',
        description: String(issue.description || '').trim(),
      }))
    : [];
  return {
    verdict: parsed.verdict === 'CLEAN' && issues.length === 0 ? 'CLEAN' : 'ISSUES',
    unanswerable: parsed.unanswerable === true,
    issues,
    issuesReport: { verdict: parsed.verdict, unanswerable: parsed.unanswerable === true, issues },
    usage,
    costCents,
  };
}

function sumUsage(usages) {
  const total = { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
  for (const usage of usages.filter(Boolean)) {
    total.input_tokens += Number(usage.input_tokens ?? 0);
    total.output_tokens += Number(usage.output_tokens ?? 0);
    total.total_tokens += Number(usage.total_tokens ?? 0);
    total.input_tokens_details.cached_tokens += Number(usage.input_tokens_details?.cached_tokens ?? 0);
    total.output_tokens_details.reasoning_tokens += Number(usage.output_tokens_details?.reasoning_tokens ?? 0);
  }
  return total;
}

async function loadCatalogTasks(rootDir, selectedPreset) {
  const tiersByPreset = { starter: ['tier1'], full: ['tier1', 'tier2'], hard: ['tier3'], frontier: ['tier1', 'tier2', 'tier3'] };
  const tiers = tiersByPreset[selectedPreset];
  if (!tiers) throw new Error(`Unsupported --preset "${selectedPreset}".`);
  const tasks = [];
  for (const tier of tiers) {
    const dir = path.join(rootDir, 'catalog', tier);
    for (const file of (await readdir(dir).catch(() => [])).sort()) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        tasks.push(parseSimpleYaml(await readFile(path.join(dir, file), 'utf8')));
      }
    }
  }
  return tasks;
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
    if (arg === '--provider') parsed.provider = argv[++index];
    else if (arg === '--model') parsed.model = argv[++index];
    else if (arg === '--preset') parsed.preset = argv[++index];
    else if (arg === '--max-output-tokens') parsed.maxOutputTokens = argv[++index];
    else if (arg === '--timeout-ms') parsed.timeoutMs = argv[++index];
    else if (arg === '--concurrency') parsed.concurrency = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
  }
  return parsed;
}
