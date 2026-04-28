import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import { aggregateJudgments, avg, sum } from './scoring.mjs';
import { summarizeUsage } from './openai-pricing.mjs';

export async function writeBundle({
  repoRoot,
  outDir,
  resultId,
  tasks,
  results,
  model,
  maxOutputTokens,
  judgeRuns = [],
  judgeConfig = null,
}) {
  const evaluatedResults = applyJudgmentsToResults(tasks, results, judgeRuns, judgeConfig);
  const aggregate = aggregateResults(tasks, evaluatedResults);
  const domains = [...new Set(tasks.map((task) => task.domain))].sort();
  const hasJudges = judgeRuns.length > 0;
  const dataFiles = ['summary.json', 'metadata.json', 'examples.json', 'tasks.json', 'scorecard.csv'];
  if (hasJudges) dataFiles.push('judgments.json');

  const summary = {
    benchmarkWeek: resultId,
    benchmarkVersion: '2026-q1',
    generatedAt: new Date().toISOString(),
    source: 'local_openai_catalog_runner',
    gitSha: getGitSha(repoRoot),
    headlineMetrics: aggregate.headlineMetrics,
  };

  const metadata = {
    benchmarkWeek: resultId,
    benchmarkVersion: '2026-q1',
    taskCount: tasks.length,
    repeatCount: aggregate.repeatCount,
    domains,
    providers: ['openai'],
    models: unique([model, ...judgeRuns.map((judge) => judge.model)]),
    runtimes: [`node-${process.versions.node}`],
    claims: buildClaims(hasJudges),
    generationMethod: {
      provider: 'openai',
      model,
      reasoningEffort: 'minimal',
      maxOutputTokens,
    },
    evaluationMethod: hasJudges
      ? {
          independentJudges: true,
          judgePanel: (judgeConfig?.judgeSpecs ?? []).map((spec) => ({
            provider: 'openai',
            model: spec.model,
            reasoningEffort: spec.reasoningEffort,
          })),
          judgeMaxOutputTokens: judgeConfig?.maxOutputTokens ?? null,
          scoreAggregation: 'median criterion score across completed independent judges',
          disagreementThresholdPoints: judgeConfig?.disagreementThresholdPoints ?? null,
          humanReviewPolicy:
            'flag if any judge recommends review, any judge fails, or judge disagreement exceeds threshold',
        }
      : {
          independentJudges: false,
          scoreAggregation: 'generator self-reported criterion scores',
        },
    tokenUsage: {
      generation: summarizeUsage(evaluatedResults),
      judging: summarizeUsage(judgeRuns),
      total: summarizeUsage([...evaluatedResults, ...judgeRuns]),
    },
    assumptions: {
      modelSelection: `${model} was selected for the cheapest complete OpenAI smoke run.`,
      reasoningEffort: 'minimal',
      maxOutputTokens,
      judgeProtocol: hasJudges
        ? 'Artifacts were scored by independent judge calls that did not generate the artifact.'
        : 'No independent judges were run; quality scores are self-reported smoke-test signals.',
    },
    dataFiles,
  };

  const writes = [
    writeJson(path.join(outDir, 'summary.json'), summary),
    writeJson(path.join(outDir, 'metadata.json'), metadata),
    writeJson(path.join(outDir, 'tasks.json'), buildTasksJson(tasks, evaluatedResults)),
    writeJson(path.join(outDir, 'examples.json'), buildExamplesJson(evaluatedResults)),
    writeFile(path.join(outDir, 'scorecard.csv'), buildScorecardCsv(tasks, evaluatedResults), 'utf8'),
  ];

  if (hasJudges) {
    writes.push(
      writeJson(path.join(outDir, 'judgments.json'), buildJudgmentsJson(resultId, judgeRuns, evaluatedResults, judgeConfig))
    );
  }

  await Promise.all(writes);

  await updateResultsIndex(repoRoot, summary, metadata);
}

export function applyJudgmentsToResults(tasks, results, judgeRuns = [], judgeConfig = null) {
  if (!judgeRuns.length) return results;

  return results.map((result) => {
    const task = taskById(tasks, result.taskId);
    const judgments = judgeRuns.filter((judgment) => judgment.runId === result.runId);
    const judgeAggregate = aggregateJudgments(
      task,
      judgments,
      judgeConfig?.disagreementThresholdPoints ?? 8
    );

    return {
      ...result,
      selfReportedQualityScore: result.selfReportedQualityScore ?? result.qualityScore,
      selfReportedCompleteness: result.selfReportedCompleteness ?? result.completeness,
      selfReportedCriterionScores: result.selfReportedCriterionScores ?? result.criterionScores,
      scoringSource: 'independent_judges',
      judgeAggregate,
      judgeCostCents: Number(sum(judgments.map((judgment) => judgment.costCents ?? 0)).toFixed(4)),
      qualityScore: judgeAggregate.qualityScore,
      completeness: judgeAggregate.completeness,
      criterionScores: judgeAggregate.criterionScores,
    };
  });
}

function buildTasksJson(tasks, results) {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    tier: task.tier,
    domain: task.domain,
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    humanBaseline: task.humanBaseline,
    constraints: task.constraints,
    runs: results
      .filter((result) => result.taskId === task.id)
      .map((result) => ({
        runId: result.runId,
        autonomousCompleted: result.autonomousCompleted,
        durationSeconds: result.durationSeconds,
        costCents: result.costCents,
        usage: result.usage ?? {},
        qualityScore: result.qualityScore,
        completeness: result.completeness,
        criterionScores: result.criterionScores,
        scoringSource: result.scoringSource ?? 'self_reported',
        selfReportedQualityScore: result.selfReportedQualityScore ?? result.qualityScore,
        selfReportedCompleteness: result.selfReportedCompleteness ?? result.completeness,
        selfReportedCriterionScores: result.selfReportedCriterionScores ?? result.criterionScores,
        judgeAggregate: result.judgeAggregate ?? null,
        judgeCostCents: result.judgeCostCents ?? 0,
      })),
  }));
}

function buildExamplesJson(results) {
  return results.map((result) => ({
    taskId: result.taskId,
    runId: result.runId,
    provider: result.provider,
    model: result.model,
    artifactMarkdown: result.artifactMarkdown,
    notes: result.notes,
    scoringSource: result.scoringSource ?? 'self_reported',
  }));
}

function aggregateResults(tasks, results) {
  const completed = results.filter((result) => result.autonomousCompleted).length;
  const totalDuration = sum(results.map((result) => result.durationSeconds));
  const totalHumanDuration = sum(
    results.map((result) => taskById(tasks, result.taskId).humanBaseline?.timeSeconds ?? 0)
  );
  const avgQuality = avg(results.map((result) => result.qualityScore));
  const avgHumanQuality = avg(
    results.map((result) => taskById(tasks, result.taskId).humanBaseline?.qualityScore ?? 0)
  );
  const avgGenerationCost = avg(results.map((result) => result.costCents ?? 0));
  const avgJudgingCost = avg(results.map((result) => result.judgeCostCents ?? 0));
  const avgCost = avg(
    results.map((result) => Number(result.costCents ?? 0) + Number(result.judgeCostCents ?? 0))
  );

  return {
    repeatCount: Math.max(
      ...tasks.map((task) => results.filter((result) => result.taskId === task.id).length)
    ),
    headlineMetrics: {
      vs_human_speedup: {
        value: Number((totalHumanDuration / Math.max(totalDuration, 0.001)).toFixed(2)),
        unit: 'x',
      },
      vs_human_quality_delta: {
        value: Number((avgQuality - avgHumanQuality).toFixed(2)),
        unit: 'points',
      },
      autonomous_completion_rate: {
        value: Number((completed / Math.max(results.length, 1)).toFixed(3)),
        unit: 'ratio',
      },
      cost_per_task_cents: {
        value: Number(avgCost.toFixed(4)),
        unit: 'cents',
      },
      generation_cost_per_task_cents: {
        value: Number(avgGenerationCost.toFixed(4)),
        unit: 'cents',
      },
      judging_cost_per_task_cents: {
        value: Number(avgJudgingCost.toFixed(4)),
        unit: 'cents',
      },
      human_review_recommended_rate: {
        value: Number(
          (
            results.filter((result) => result.judgeAggregate?.humanReviewRecommended).length /
            Math.max(results.length, 1)
          ).toFixed(3)
        ),
        unit: 'ratio',
      },
    },
  };
}

function buildScorecardCsv(tasks, results) {
  const headers = [
    'task_id',
    'run_id',
    'mode',
    'provider',
    'model',
    'domain',
    'tier',
    'autonomous_completed',
    'duration_seconds',
    'cost_cents',
    'quality_score',
    'completeness',
    'scoring_source',
    'judge_count',
    'judge_disagreement_points',
    'human_review_recommended',
    'judge_cost_cents',
    'human_baseline_seconds',
    'human_quality_score',
  ];

  const rows = results.map((result) => {
    const task = taskById(tasks, result.taskId);
    return [
      task.id,
      result.runId,
      'local_openai',
      result.provider,
      result.model,
      task.domain,
      task.tier,
      String(result.autonomousCompleted),
      String(result.durationSeconds),
      result.costCents == null ? '' : String(result.costCents),
      String(result.qualityScore),
      String(result.completeness),
      result.scoringSource ?? 'self_reported',
      String(result.judgeAggregate?.judgeCount ?? ''),
      String(result.judgeAggregate?.disagreementPoints ?? ''),
      String(Boolean(result.judgeAggregate?.humanReviewRecommended)),
      String(result.judgeCostCents ?? 0),
      String(task.humanBaseline?.timeSeconds ?? ''),
      String(task.humanBaseline?.qualityScore ?? ''),
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}

function buildJudgmentsJson(resultId, judgeRuns, evaluatedResults, judgeConfig) {
  return {
    benchmarkWeek: resultId,
    generatedAt: new Date().toISOString(),
    protocol: {
      independentJudges: true,
      judgePanel: judgeConfig?.judgeSpecs ?? [],
      judgeMaxOutputTokens: judgeConfig?.maxOutputTokens ?? null,
      disagreementThresholdPoints: judgeConfig?.disagreementThresholdPoints ?? null,
      scoreAggregation: 'median criterion score across completed independent judges',
    },
    runs: evaluatedResults.map((result) => ({
      taskId: result.taskId,
      runId: result.runId,
      generatorModel: result.model,
      selfReported: {
        qualityScore: result.selfReportedQualityScore,
        completeness: result.selfReportedCompleteness,
        criterionScores: result.selfReportedCriterionScores,
      },
      aggregate: result.judgeAggregate,
      judges: judgeRuns.filter((judgment) => judgment.runId === result.runId),
    })),
  };
}

function buildClaims(hasJudges) {
  if (!hasJudges) {
    return [
      'Local public-catalog run using OpenAI Responses API.',
      'Scores are self-reported by the model against public acceptance criteria and are intended for smoke testing complete bundle generation.',
    ];
  }

  return [
    'Local public-catalog run using OpenAI Responses API.',
    'Artifacts were scored by independent OpenAI judge calls that did not generate the artifact.',
    'Public quality scores use median criterion scores and flag material judge disagreement for human review.',
  ];
}

async function updateResultsIndex(repoRoot, summary, metadata) {
  const indexPath = path.join(repoRoot, 'results', 'index.json');
  let index = { weeks: [] };
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    index = { weeks: [] };
  }

  const entry = {
    id: summary.benchmarkWeek,
    path: `results/${summary.benchmarkWeek}`,
    benchmarkVersion: summary.benchmarkVersion,
    generatedAt: summary.generatedAt,
    taskCount: metadata.taskCount,
    providers: metadata.providers,
    models: metadata.models,
    headlineMetrics: summary.headlineMetrics,
  };

  const weeks = Array.isArray(index.weeks) ? index.weeks : [];
  index.weeks = [entry, ...weeks.filter((week) => week.id !== entry.id)];
  await writeJson(indexPath, index);
}

function taskById(tasks, id) {
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Unknown task id: ${id}`);
  return task;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function csvEscape(value) {
  const string = String(value ?? '');
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function getGitSha(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
