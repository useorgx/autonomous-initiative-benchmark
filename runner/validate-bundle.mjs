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

const flow = summary.headlineMetrics?.vs_human_speedup?.value;
const quality = summary.headlineMetrics?.vs_human_quality_delta?.value;
const issues = validateBundle({ summary, metadata, tasks, examples, scorecardCsv, strict });

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

function validateBundle({ summary, metadata, tasks, examples, scorecardCsv, strict }) {
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

  for (const task of tasks) {
    validateTask(task, errors, warnings, strict);
  }

  if (strict) {
    if (Number(metadata.repeatCount ?? 0) < 3) {
      errors.push('strict mode requires metadata.repeatCount >= 3.');
    }
    if (selfReportedClaim && !metadata.evaluationMethod?.independentJudges) {
      errors.push('strict mode requires independent judge metadata; self-reported-only scoring is smoke-test quality.');
    }
    const designCount = tasks.filter((task) => task.domain === 'design').length;
    if (designCount < 3) {
      errors.push(`strict mode requires at least 3 design tasks; found ${designCount}.`);
    }
  }

  return { errors, warnings };
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
