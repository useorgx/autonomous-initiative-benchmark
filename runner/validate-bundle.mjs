#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const weekDir = args.find((arg) => arg !== '--strict');
if (!weekDir) {
  console.error('Usage: node validate-bundle.mjs <results/week-dir> [--strict]');
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
const tasks = JSON.parse(await readFile(path.join(baseDir, 'tasks.json'), 'utf8'));
const examples = JSON.parse(await readFile(path.join(baseDir, 'examples.json'), 'utf8'));
const scorecardCsv = await readFile(path.join(baseDir, 'scorecard.csv'), 'utf8');
const judgments = await readOptionalJson(path.join(baseDir, 'judgments.json'));

const flow = summary.headlineMetrics?.vs_human_speedup?.value;
const quality = summary.headlineMetrics?.vs_human_quality_delta?.value;
const issues = validateBundle({ summary, metadata, tasks, examples, scorecardCsv, judgments, strict });

if (issues.errors.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        benchmarkWeek: summary.benchmarkWeek,
        strict,
        errors: issues.errors,
        warnings: issues.warnings,
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
      benchmarkWeek: summary.benchmarkWeek,
      benchmarkVersion: summary.benchmarkVersion,
      taskCount: metadata.taskCount,
      repeatCount: metadata.repeatCount,
      flowMultiplier: flow,
      qualityDeltaVsHuman: quality,
      strict,
      warnings: issues.warnings,
    },
    null,
    2
  )
);

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function validateBundle({ summary, metadata, tasks, examples, scorecardCsv, judgments, strict }) {
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

  for (const section of ['generation', 'total']) {
    const current = usage[section];
    if (!current) {
      const message = `metadata.tokenUsage.${section} is missing.`;
      if (strict) errors.push(`strict mode requires metadata.tokenUsage.${section}.`);
      else warnings.push(message);
      continue;
    }
    if (!Number.isFinite(Number(current.totalTokens)) || Number(current.totalTokens) <= 0) {
      const message = `metadata.tokenUsage.${section}.totalTokens must be positive.`;
      if (strict) errors.push(message);
      else warnings.push(message);
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
