#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { HEADLINE_SPLIT } from './lib/corpus-splits.mjs';
import { HUMAN_BASELINE_MIN_N, HUMAN_BASELINE_PROTOCOL_VERSION } from './lib/human-baselines.mjs';
import { collectReplicationRowsFromMetadata, summarizeReplicationRows } from './lib/replication-evidence.mjs';

const PUBLICATION_LABELS = new Set(['headline', 'mechanism', 'with-caveats', 'invalid-for-cost', 'do-not-publish']);

if (isMain(import.meta.url, process.argv[1])) {
  await main(process.argv.slice(2));
}

async function main(args) {
  const strict = args.includes('--strict');
  const weekDir = args.find((arg) => arg !== '--strict');
  if (!weekDir) {
    console.error('Usage: node validate-bundle.mjs <results/week-dir> [--strict]');
    process.exit(1);
  }

  let result;
  try {
    result = await validateBundleDirectory(weekDir, { strict });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (result.issues.errors.length) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          benchmarkWeek: result.summary.benchmarkWeek,
          strict,
          errors: result.issues.errors,
          warnings: result.issues.warnings,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        benchmarkWeek: result.summary.benchmarkWeek,
        benchmarkVersion: result.summary.benchmarkVersion,
        taskCount: result.metadata.taskCount,
        repeatCount: result.metadata.repeatCount,
        flowMultiplier: result.flow,
        qualityDeltaVsHuman: result.quality,
        strict,
        warnings: result.issues.warnings,
      },
      null,
      2
    )
  );
}

export async function validateBundleDirectory(weekDir, { strict = false, cwd = process.cwd() } = {}) {
  const baseDir = path.resolve(cwd, weekDir);
  const requiredFiles = ['summary.json', 'metadata.json', 'examples.json', 'tasks.json', 'scorecard.csv'];
  for (const file of requiredFiles) {
    try {
      await readFile(path.join(baseDir, file), 'utf8');
    } catch (error) {
      throw new Error(`Missing required benchmark bundle file: ${file}`);
    }
  }

  const summary = JSON.parse(await readFile(path.join(baseDir, 'summary.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(path.join(baseDir, 'metadata.json'), 'utf8'));
  const tasks = JSON.parse(await readFile(path.join(baseDir, 'tasks.json'), 'utf8'));
  const examples = JSON.parse(await readFile(path.join(baseDir, 'examples.json'), 'utf8'));
  const scorecardCsv = await readFile(path.join(baseDir, 'scorecard.csv'), 'utf8');
  const judgments = await readOptionalJson(path.join(baseDir, 'judgments.json'));
  const flow = summary.headlineMetrics?.vs_human_speedup?.value;
  const quality = summary.headlineMetrics?.vs_human_quality_delta?.value;
  const issues = validateBundle({ summary, metadata, tasks, examples, scorecardCsv, judgments, strict });

  return { summary, metadata, tasks, examples, scorecardCsv, judgments, flow, quality, issues };
}

function isMain(moduleUrl, argvPath) {
  return Boolean(argvPath) && moduleUrl === pathToFileURL(path.resolve(argvPath)).href;
}

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export function validateBundle({ summary, metadata, tasks, examples, scorecardCsv, judgments, strict }) {
  const errors = [];
  const warnings = [];

  if (!summary.benchmarkWeek) errors.push('summary.benchmarkWeek is required.');
  if (!summary.benchmarkVersion) errors.push('summary.benchmarkVersion is required.');
  if (!metadata.benchmarkWeek) errors.push('metadata.benchmarkWeek is required.');
  if (summary.benchmarkWeek && metadata.benchmarkWeek && summary.benchmarkWeek !== metadata.benchmarkWeek) {
    errors.push('summary.benchmarkWeek must match metadata.benchmarkWeek.');
  }

  if (!Array.isArray(tasks) || tasks.length === 0) errors.push('tasks.json must contain at least one task.');
  if (!Array.isArray(examples)) errors.push('examples.json must be an array.');
  if (Number(metadata.taskCount) !== tasks.length) {
    errors.push(`metadata.taskCount (${metadata.taskCount}) must match tasks.json length (${tasks.length}).`);
  }

  const rows = scorecardCsv
    .trim()
    .split('\n')
    .filter(Boolean);
  const scorecardRunCount = Math.max(0, rows.length - 1);
  const allRuns = tasks.flatMap((task) => task.runs ?? []);
  if (scorecardRunCount !== allRuns.length) {
    errors.push(`scorecard row count (${scorecardRunCount}) must match task run count (${allRuns.length}).`);
  }
  if (Array.isArray(examples) && examples.length !== allRuns.length) {
    errors.push(`examples count (${examples.length}) must match task run count (${allRuns.length}).`);
  }

  const selfReportedClaim = (metadata.claims ?? []).some((claim) =>
    String(claim).toLowerCase().includes('self-reported')
  );
  if (!selfReportedClaim && !metadata.evaluationMethod) {
    warnings.push('metadata should disclose whether scoring is self-reported or independently judged.');
  }

  validateJudgments({ metadata, tasks, judgments, errors, warnings, strict });
  validateTokenUsage({ metadata, errors, warnings, strict });
  validatePublicationContract({ metadata, tasks, strict, errors, warnings });
  validateHeadlineEvidenceContract({ summary, metadata, tasks, strict, errors, warnings });
  validateModelIdentityContract({ metadata, tasks, strict, errors, warnings });
  validateAccountingContract({ metadata, tasks, strict, errors, warnings });

  for (const task of tasks) {
    validateTask(task, errors, warnings, strict);
  }

  if (strict) {
    if (Number(metadata.repeatCount ?? 0) < 3) {
      errors.push('strict mode requires metadata.repeatCount >= 3.');
    }
    if (!metadata.evaluationMethod?.independentJudges) {
      errors.push('strict mode requires independent judge metadata; self-reported-only scoring is smoke-test quality.');
    }
    const designCount = tasks.filter((task) => task.domain === 'design').length;
    if (designCount < 3) {
      errors.push(`strict mode requires at least 3 design tasks; found ${designCount}.`);
    }
  }

  return { errors, warnings };
}

export function validatePublicationContract({ metadata, tasks, strict, errors, warnings }) {
  if (!strict) return;

  const label = metadata.publicationLabel ?? metadata.publication?.label;
  if (!label) {
    errors.push('strict mode requires metadata.publicationLabel.');
  } else if (!PUBLICATION_LABELS.has(label)) {
    errors.push(`metadata.publicationLabel must be one of ${[...PUBLICATION_LABELS].join(', ')}; found ${label}.`);
  }

  const allRuns = tasks.flatMap((task) => task.runs ?? []);
  const scoredRunIds = new Set(allRuns.map((run) => run.runId).filter(Boolean));
  const lossEntries = getLossRegistryEntries(metadata);
  if (!lossEntries) {
    errors.push('strict mode requires metadata.lossRegistry array, even when no runs were lost.');
  }

  const launchedRunCount = getLaunchedRunCount(metadata);
  if (!Number.isFinite(launchedRunCount)) {
    errors.push('strict mode requires metadata.launchedRunCount or metadata.launchLog for launched-run accounting.');
  } else if (lossEntries) {
    const expected = allRuns.length + lossEntries.length;
    if (launchedRunCount !== expected) {
      errors.push(
        `launched-run accounting identity failed: launchedRunCount ${launchedRunCount} must equal scored runs ${allRuns.length} + loss registry entries ${lossEntries.length}.`
      );
    }
  }

  if (!lossEntries) return;

  const lossRunIds = new Set();
  lossEntries.forEach((entry, index) => {
    const labelPrefix = `metadata.lossRegistry[${index}]`;
    const runId = typeof entry.runId === 'string' ? entry.runId.trim() : '';
    if (!runId) {
      errors.push(`${labelPrefix}.runId is required.`);
    } else {
      if (lossRunIds.has(runId)) errors.push(`metadata.lossRegistry contains duplicate runId ${runId}.`);
      lossRunIds.add(runId);
      if (scoredRunIds.has(runId)) errors.push(`metadata.lossRegistry runId ${runId} is also present in scored task runs.`);
    }
    if (entry.countedAsLoss !== true) {
      errors.push(`${labelPrefix}.countedAsLoss must be true.`);
    }
    if (!entry.reason && !entry.lossType) {
      errors.push(`${labelPrefix} requires reason or lossType.`);
    }
    if (!entry.publicLabel) {
      errors.push(`${labelPrefix}.publicLabel is required.`);
    }
  });
}

export function validateHeadlineEvidenceContract({ summary = {}, metadata, tasks, strict, errors, warnings }) {
  if (!strict) return;

  const label = metadata.publicationLabel ?? metadata.publication?.label;
  if (label !== 'headline') return;

  const headlineTasks = Array.isArray(tasks) ? tasks : [];
  const nonHoldoutTasks = headlineTasks.filter((task) => taskSplit(task) !== HEADLINE_SPLIT);
  for (const task of nonHoldoutTasks) {
    errors.push(
      `Headline task ${task.id ?? task.worldId ?? '<unknown>'} must be split=${HEADLINE_SPLIT}; found ${taskSplit(task)}.`
    );
  }

  const expectedWorldIds = [
    ...new Set(
      headlineTasks.map((task) => taskWorldId(task)).filter((worldId) => typeof worldId === 'string' && worldId.trim())
    ),
  ];
  const baselineSummary = getHumanBaselineSummary({ summary, metadata });
  if (!baselineSummary) {
    errors.push('headline strict mode requires protocol-complete human_baseline_summary evidence.');
  } else {
    validateHeadlineHumanBaselines({ baselineSummary, expectedWorldIds, errors });
  }

  const replicationRows = collectReplicationRowsFromMetadata(metadata);
  const replicationSummary = summarizeReplicationRows(replicationRows);
  for (const issue of replicationSummary.errors) {
    errors.push(`metadata external replication row[${issue.index}]: ${issue.error}.`);
  }
  if (replicationSummary.validRows === 0) {
    errors.push('headline strict mode requires at least one valid third-party replication row.');
  }
  if (replicationSummary.validRows > 0 && replicationSummary.agreementWithinCiRows === 0) {
    errors.push('headline strict mode requires at least one third-party replication row with agreement_within_ci=true.');
  }
}

export function validateModelIdentityContract({ metadata, tasks, strict, errors, warnings }) {
  if (!strict) return;

  const modelManifest = metadata.modelManifest ?? metadata.evaluationManifest?.modelManifest;
  if (!isRecord(modelManifest) || !Array.isArray(modelManifest.models) || modelManifest.models.length === 0) {
    errors.push('strict mode requires metadata.modelManifest.models for provider-reported model identity checks.');
    return;
  }

  const modelById = new Map();
  const modelByProviderModel = new Map();
  for (const model of modelManifest.models) {
    if (!isRecord(model)) continue;
    if (model.id) modelById.set(model.id, model);
    if (model.provider && model.model) modelByProviderModel.set(`${model.provider}:${model.model}`, model);
  }

  for (const run of tasks.flatMap((task) => task.runs ?? [])) {
    if (isHumanRun(run)) continue;

    const manifestEntry = resolveRunModelManifestEntry({ run, modelManifest, modelById, modelByProviderModel });
    const runLabel = run.runId ?? '<unknown>';
    if (!manifestEntry) {
      errors.push(`Run ${runLabel} must reference a modelManifest entry for strict provider identity checks.`);
      continue;
    }

    if (run.provider && manifestEntry.provider && run.provider !== manifestEntry.provider) {
      errors.push(`Run ${runLabel} provider ${run.provider} must match modelManifest provider ${manifestEntry.provider}.`);
    }

    const reportedModel = getProviderReportedModel({ run, metadata });
    if (!reportedModel) {
      errors.push(`Run ${runLabel} missing provider-reported model id.`);
      continue;
    }
    if (String(reportedModel) !== String(manifestEntry.model)) {
      errors.push(
        `Run ${runLabel} provider-reported model id ${reportedModel} must match modelManifest model ${manifestEntry.model}.`
      );
    }
  }
}

export function validateAccountingContract({ metadata, tasks, strict, errors, warnings }) {
  if (!strict) return;

  if (metadata.costComparable === false || metadata.accountingComparable === false) {
    errors.push('strict mode requires cost/accounting comparable metadata; costComparable/accountingComparable cannot be false.');
  }

  const metadataMissingStreams = [
    ...(Array.isArray(metadata.missingAccountingStreams) ? metadata.missingAccountingStreams : []),
    ...(Array.isArray(metadata.accounting?.missingAccountingStreams) ? metadata.accounting.missingAccountingStreams : []),
  ];
  if (metadataMissingStreams.length > 0) {
    errors.push(`strict mode requires no missing accounting streams; found ${metadataMissingStreams.join(', ')}.`);
  }

  const metadataFallbackCount = firstFiniteNumber([
    metadata.normalizedCostFallbackRunCount,
    metadata.accounting?.normalizedCostFallbackRunCount,
    metadata.accounting?.fallbackRunCount,
  ]);
  if (Number.isFinite(metadataFallbackCount) && metadataFallbackCount !== 0) {
    errors.push(`strict mode requires normalizedCostFallbackRunCount=0; found ${metadataFallbackCount}.`);
  }

  for (const run of tasks.flatMap((task) => task.runs ?? [])) {
    if (isHumanRun(run)) continue;

    const runLabel = run.runId ?? '<unknown>';
    const runFallbackUsed = Boolean(run.normalizedCostFallbackUsed ?? run.accounting?.normalizedCostFallbackUsed);
    if (runFallbackUsed) {
      errors.push(`Run ${runLabel} used normalized cost fallback; strict headline accounting requires provider usage.`);
    }

    const missingStreams = [
      ...(Array.isArray(run.missingAccountingStreams) ? run.missingAccountingStreams : []),
      ...(Array.isArray(run.accounting?.missingAccountingStreams) ? run.accounting.missingAccountingStreams : []),
    ];
    if (missingStreams.length > 0) {
      errors.push(`Run ${runLabel} missing accounting streams: ${missingStreams.join(', ')}.`);
    }

    if (run.accountingComparable === false || run.accounting?.accountingComparable === false) {
      errors.push(`Run ${runLabel} is not accounting comparable.`);
    }

    const usageProvenance =
      run.usageProvenance ??
      run.usage?.usageProvenance ??
      run.usage?.provenance ??
      run.accounting?.usageProvenance ??
      metadata.usageProvenance ??
      metadata.accounting?.usageProvenance;
    if (usageProvenance !== 'provider_usage') {
      errors.push(`Run ${runLabel} usageProvenance must be provider_usage in strict mode.`);
    }
  }
}

function getLossRegistryEntries(metadata) {
  if (Array.isArray(metadata.lossRegistry)) return metadata.lossRegistry;
  if (Array.isArray(metadata.lossRegistry?.entries)) return metadata.lossRegistry.entries;
  return null;
}

function getHumanBaselineSummary({ summary, metadata }) {
  return (
    metadata.human_baseline_summary ??
    metadata.humanBaselineSummary ??
    metadata.humanBaselines?.summary ??
    summary.human_baseline_summary ??
    summary.humanBaselineSummary ??
    null
  );
}

function validateHeadlineHumanBaselines({ baselineSummary, expectedWorldIds, errors }) {
  if (baselineSummary.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION) {
    errors.push(`human_baseline_summary.protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}.`);
  }
  if (baselineSummary.headline_eligible !== true) {
    errors.push('human_baseline_summary.headline_eligible must be true for headline strict mode.');
  }
  if (Number(baselineSummary.humans) < HUMAN_BASELINE_MIN_N) {
    errors.push(`human_baseline_summary.humans must be >= ${HUMAN_BASELINE_MIN_N}.`);
  }
  if (Number(baselineSummary.protocol_error_count ?? 0) !== 0) {
    errors.push('human_baseline_summary.protocol_error_count must be 0.');
  }
  if (baselineSummary.protocol_eligible !== true) {
    errors.push('human_baseline_summary.protocol_eligible must be true.');
  }
  if (Number(baselineSummary.worlds_with_minimum_humans) < expectedWorldIds.length) {
    errors.push(
      `human_baseline_summary.worlds_with_minimum_humans must cover all headline worlds; expected ${expectedWorldIds.length}, found ${baselineSummary.worlds_with_minimum_humans}.`
    );
  }

  const perWorld = new Map((baselineSummary.per_world ?? []).map((world) => [world.world_id, world]));
  for (const worldId of expectedWorldIds) {
    const world = perWorld.get(worldId);
    if (!world) {
      errors.push(`human_baseline_summary.per_world missing headline world ${worldId}.`);
      continue;
    }
    if (Number(world.humans) < HUMAN_BASELINE_MIN_N || world.protocol_eligible !== true) {
      errors.push(
        `human_baseline_summary.per_world ${worldId} must have >= ${HUMAN_BASELINE_MIN_N} protocol-eligible humans.`
      );
    }
  }
}

function taskSplit(task) {
  return task.split ?? task.corpusSplit ?? task.worldSplit ?? task.world?.split ?? 'public_validation';
}

function taskWorldId(task) {
  return task.worldId ?? task.world_id ?? task.world?.id ?? task.id;
}

function getLaunchedRunCount(metadata) {
  const candidates = [
    metadata.launchedRunCount,
    metadata.launchLog?.launchedRunCount,
    metadata.launchLog?.count,
    Array.isArray(metadata.launchLog) ? metadata.launchLog.length : undefined,
    Array.isArray(metadata.launchLog?.launchedRuns) ? metadata.launchLog.launchedRuns.length : undefined,
    Array.isArray(metadata.launchLog?.runs) ? metadata.launchLog.runs.length : undefined,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return NaN;
}

function resolveRunModelManifestEntry({ run, modelManifest, modelById, modelByProviderModel }) {
  const manifestId = run.modelManifestId ?? run.modelManifestEntryId ?? run.modelManifest?.id ?? run.accounting?.modelManifestId;
  if (manifestId && modelById.has(manifestId)) return modelById.get(manifestId);
  if (manifestId) return null;

  if (run.provider && run.model) {
    return modelByProviderModel.get(`${run.provider}:${run.model}`) ?? null;
  }

  if (modelManifest.models.length === 1) return modelManifest.models[0];
  return null;
}

function getProviderReportedModel({ run, metadata }) {
  return (
    run.providerReportedModelId ??
    run.providerReportedModel ??
    run.usage?.providerReportedModelId ??
    run.usage?.providerReportedModel ??
    run.usage?.model ??
    run.usage?.model_id ??
    run.providerUsage?.model ??
    run.accounting?.providerReportedModelId ??
    run.accounting?.providerReportedModel ??
    metadata.providerReportedModelsByRunId?.[run.runId] ??
    null
  );
}

function isHumanRun(run) {
  return ['human', 'timed_human'].includes(run.provider) || ['human', 'timed_human'].includes(run.mode) || run.system === 'timed_human' || run.arm === 'human';
}

function firstFiniteNumber(candidates) {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return NaN;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateJudgments({ metadata, tasks, judgments, errors, warnings, strict }) {
  const allRuns = tasks.flatMap((task) => task.runs ?? []);
  const expectsJudgments = Boolean(metadata.evaluationMethod?.independentJudges);

  if (!expectsJudgments && judgments) {
    warnings.push('judgments.json exists but metadata.evaluationMethod.independentJudges is not true.');
  }

  if (expectsJudgments && !judgments) {
    errors.push('metadata declares independent judges, but judgments.json is missing.');
    return;
  }

  if (strict && !judgments) {
    errors.push('strict mode requires judgments.json.');
    return;
  }

  if (!judgments) return;

  if (!Array.isArray(judgments.runs)) {
    errors.push('judgments.json must include a runs array.');
    return;
  }
  if (judgments.runs.length !== allRuns.length) {
    errors.push(`judgments run count (${judgments.runs.length}) must match task run count (${allRuns.length}).`);
  }

  const panelSize = metadata.evaluationMethod?.judgePanel?.length ?? judgments.protocol?.judgePanel?.length ?? 0;
  if (strict && panelSize < 3) {
    errors.push(`strict mode requires at least 3 independent judges; found ${panelSize}.`);
  }

  const judgmentsByRunId = new Map(judgments.runs.map((run) => [run.runId, run]));
  for (const run of allRuns) {
    const judgedRun = judgmentsByRunId.get(run.runId);
    if (!judgedRun) {
      errors.push(`judgments.json missing run ${run.runId}.`);
      continue;
    }
    const judges = judgedRun.judges ?? [];
    const completedJudges = judges.filter((judge) => judge.status === 'completed');
    if (strict && completedJudges.length < 3) {
      errors.push(`Run ${run.runId} requires at least 3 completed judges in strict mode.`);
    }
    if (run.scoringSource !== 'independent_judges') {
      errors.push(`Run ${run.runId} must use scoringSource=independent_judges when judgments are present.`);
    }
    if (!judgedRun.aggregate || !Number.isFinite(Number(judgedRun.aggregate.qualityScore))) {
      errors.push(`Run ${run.runId} missing numeric judgment aggregate qualityScore.`);
    }
    if (Number(run.judgeAggregate?.qualityScore) !== Number(judgedRun.aggregate?.qualityScore)) {
      errors.push(`Run ${run.runId} task score must match judgments aggregate qualityScore.`);
    }
    for (const judge of judges) {
      if (!judge.model || !judge.reasoningEffort) {
        errors.push(`Run ${run.runId} has a judge missing model or reasoningEffort.`);
      }
      if (!Number.isFinite(Number(judge.usage?.output_tokens_details?.reasoning_tokens ?? 0))) {
        errors.push(`Run ${run.runId} judge ${judge.judgeId} missing reasoning token usage metadata.`);
      }
      if (!Number.isFinite(Number(judge.costCents))) {
        errors.push(`Run ${run.runId} judge ${judge.judgeId} missing numeric costCents.`);
      }
    }
  }
}

function validateTokenUsage({ metadata, errors, warnings, strict }) {
  const usage = metadata.tokenUsage;
  if (!usage) {
    const message = 'metadata.tokenUsage is missing.';
    if (strict) errors.push('strict mode requires metadata.tokenUsage.');
    else warnings.push(message);
    return;
  }

  // New telemetry semantics (2026-06-22): missing usage is `null` (explicit
  // unknown), never `0`. A `null` section is VALID only when the bundle is
  // marked not-cost-comparable. A zero/absent total with a named generation
  // model and no such flag is the old "free generation" bug — now an error.
  const explicitlyUnknown = metadata.costComparable === false;
  for (const section of ['generation', 'total']) {
    const current = usage[section];
    if (!current) {
      const message = `metadata.tokenUsage.${section} is missing.`;
      if (strict) errors.push(`strict mode requires metadata.tokenUsage.${section}.`);
      else warnings.push(message);
      continue;
    }
    if (current.totalTokens === null) {
      if (!explicitlyUnknown) {
        errors.push(`metadata.tokenUsage.${section}.totalTokens is null but metadata.costComparable is not false — nulled telemetry must set costComparable:false.`);
      }
      // valid explicit-unknown: do not also require costCents to be numeric.
      continue;
    }
    if (!Number.isFinite(Number(current.totalTokens)) || Number(current.totalTokens) <= 0) {
      errors.push(`metadata.tokenUsage.${section}.totalTokens is ${current.totalTokens}: represent missing telemetry as null with costComparable:false, never 0.`);
    }
    if (!Number.isFinite(Number(current.costCents))) {
      errors.push(`metadata.tokenUsage.${section}.costCents must be numeric.`);
    }
  }

  if (metadata.evaluationMethod?.independentJudges) {
    const judging = usage.judging;
    if (!judging) {
      errors.push('metadata declares independent judges, but metadata.tokenUsage.judging is missing.');
      return;
    }
    if (!Number.isFinite(Number(judging.totalTokens)) || Number(judging.totalTokens) <= 0) {
      errors.push('metadata.tokenUsage.judging.totalTokens must be positive for independently judged bundles.');
    }
    if (!Number.isFinite(Number(judging.reasoningTokens))) {
      errors.push('metadata.tokenUsage.judging.reasoningTokens must be numeric.');
    }
    if (!Number.isFinite(Number(judging.costCents))) {
      errors.push('metadata.tokenUsage.judging.costCents must be numeric.');
    }
  }
}

function validateTask(task, errors, warnings, strict) {
  if (!task.id) errors.push('Each task requires an id.');
  if (!task.domain) errors.push(`Task ${task.id ?? '<unknown>'} requires a domain.`);
  if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length < 3) {
    errors.push(`Task ${task.id ?? '<unknown>'} must include at least 3 acceptance criteria.`);
  }

  const baseline = task.humanBaseline ?? {};
  for (const field of ['timeSeconds', 'costCents', 'qualityScore', 'completeness', 'sampleSize']) {
    if (!Number.isFinite(Number(baseline[field]))) {
      errors.push(`Task ${task.id ?? '<unknown>'} humanBaseline.${field} must be numeric.`);
    }
  }
  if (!baseline.methodology) warnings.push(`Task ${task.id ?? '<unknown>'} should disclose humanBaseline.methodology.`);
  if (!baseline.sourceSummary) warnings.push(`Task ${task.id ?? '<unknown>'} should disclose humanBaseline.sourceSummary.`);

  const criteriaIds = new Set((task.acceptanceCriteria ?? []).map((criterion) => criterion.id));
  for (const run of task.runs ?? []) {
    if (run.autonomousCompleted !== true) errors.push(`Run ${run.runId} must be autonomously completed.`);
    if (!Number.isFinite(Number(run.durationSeconds)) || Number(run.durationSeconds) <= 0) {
      errors.push(`Run ${run.runId} must include positive durationSeconds.`);
    }
    if (!Number.isFinite(Number(run.qualityScore))) errors.push(`Run ${run.runId} must include numeric qualityScore.`);
    if (!Number.isFinite(Number(run.completeness))) errors.push(`Run ${run.runId} must include numeric completeness.`);
    for (const criterionId of criteriaIds) {
      if (!Number.isFinite(Number(run.criterionScores?.[criterionId]))) {
        errors.push(`Run ${run.runId} missing criterion score for ${criterionId}.`);
      }
    }
    if (strict) {
      if (Number(run.completeness) < 0.85) {
        errors.push(`Run ${run.runId} completeness ${run.completeness} is below strict threshold 0.85.`);
      }
      if (Number(run.qualityScore) < 85) {
        errors.push(`Run ${run.runId} qualityScore ${run.qualityScore} is below strict threshold 85.`);
      }
      const lowCriteria = Object.entries(run.criterionScores ?? {}).filter(([, value]) => Number(value) < 0.8);
      for (const [criterionId, value] of lowCriteria) {
        errors.push(`Run ${run.runId} criterion ${criterionId} score ${value} is below strict threshold 0.8.`);
      }
    }
  }
}
