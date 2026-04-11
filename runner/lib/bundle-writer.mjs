import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

export async function writeBundle({ repoRoot, outDir, resultId, tasks, results, model, maxOutputTokens }) {
  const aggregate = aggregateResults(tasks, results);
  const domains = [...new Set(tasks.map((task) => task.domain))].sort();

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
    models: [model],
    runtimes: [`node-${process.versions.node}`],
    claims: [
      'Local public-catalog run using OpenAI Responses API.',
      'Scores are self-reported by the model against public acceptance criteria and are intended for smoke testing complete bundle generation.',
    ],
    assumptions: {
      modelSelection: `${model} was selected for the cheapest complete OpenAI smoke run.`,
      reasoningEffort: 'minimal',
      maxOutputTokens,
    },
    dataFiles: ['summary.json', 'metadata.json', 'examples.json', 'tasks.json', 'scorecard.csv'],
  };

  await Promise.all([
    writeJson(path.join(outDir, 'summary.json'), summary),
    writeJson(path.join(outDir, 'metadata.json'), metadata),
    writeJson(path.join(outDir, 'tasks.json'), buildTasksJson(tasks, results)),
    writeJson(path.join(outDir, 'examples.json'), buildExamplesJson(results)),
    writeFile(path.join(outDir, 'scorecard.csv'), buildScorecardCsv(tasks, results), 'utf8'),
  ]);

  await updateResultsIndex(repoRoot, summary, metadata);
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
        qualityScore: result.qualityScore,
        completeness: result.completeness,
        criterionScores: result.criterionScores,
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
  const avgCost = avg(results.map((result) => result.costCents ?? 0));

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
      String(task.humanBaseline?.timeSeconds ?? ''),
      String(task.humanBaseline?.qualityScore ?? ''),
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
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

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function avg(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
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
