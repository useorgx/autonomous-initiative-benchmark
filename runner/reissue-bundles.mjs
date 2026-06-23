// Reissue published bundles with corrected attribution + telemetry semantics.
//
// Fixes the three integrity defects in already-written result bundles:
//   1. Judge-attribution: "independent OpenAI judge calls" -> the ACTUAL panel.
//   2. Zero-cost telemetry: missing generation usage -> null (+ coverage flags),
//      bundle marked costComparable:false / invalidForCost:true.
//   3. Headline: Flow Multiplier demoted; un-comparable cost nulled.
// Also regenerates results/index.json from the corrected bundles.
//
// Idempotent: re-running makes no further changes once corrected.
// Usage: node runner/reissue-bundles.mjs [--write]   (default: dry-run)

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildClaims } from './lib/claims.mjs';
import { generationTelemetryMissing, coverageOf } from './lib/telemetry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = path.join(repoRoot, 'results');
const WRITE = process.argv.includes('--write');

const NULL_USAGE = {
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
  costCents: null,
  coverage: 0,
  note: 'telemetry missing — represented as unknown, not zero',
};

function judgingMeasured(metadata) {
  const j = metadata?.tokenUsage?.judging ?? {};
  return Number(j.totalTokens ?? 0) > 0 ? 1 : metadata?.evaluationMethod?.independentJudges ? 0 : 1;
}

function correctMetadata(metadata) {
  const changes = [];
  const hasJudges = Boolean(metadata?.evaluationMethod?.independentJudges);
  const judgePanel = metadata?.evaluationMethod?.judgePanel ?? [];
  const generationMethod = metadata?.generationMethod ?? {};

  // Already-nulled generation is STILL missing telemetry (coverage 0), not
  // healthy — otherwise a second pass would flip costComparable back to true
  // while tokens stay null. This is what makes the reissue idempotent.
  const genAlreadyNulled = metadata?.tokenUsage?.generation?.totalTokens === null;
  const genMissing = generationTelemetryMissing(metadata) || genAlreadyNulled;
  const genCoverage = genMissing ? 0 : 1;
  const judgeCoverage = judgingMeasured(metadata);
  const isCostComparable = genCoverage >= 1 && judgeCoverage >= 1;

  // 1. correct claims from the real manifest
  const newClaims = buildClaims({ generationMethod, judgePanel, hasJudges, costComparable: isCostComparable });
  if (JSON.stringify(metadata.claims) !== JSON.stringify(newClaims)) {
    changes.push('claims re-derived from actual provider + judge panel');
    metadata.claims = newClaims;
  }

  // 2. null the missing generation telemetry (only once — idempotent)
  if (genMissing && !genAlreadyNulled) {
    changes.push('generation telemetry was 0 with a named model -> nulled (unknown, not free)');
    metadata.tokenUsage.generation = { ...NULL_USAGE };
    metadata.tokenUsage.total = { ...NULL_USAGE };
  }

  // 3. coverage + comparability flags
  const newCoverage = { generation: genCoverage, judging: judgeCoverage };
  if (JSON.stringify(metadata.telemetryCoverage) !== JSON.stringify(newCoverage)) {
    changes.push(`telemetryCoverage set generation=${genCoverage} judging=${judgeCoverage}`);
    metadata.telemetryCoverage = newCoverage;
  }
  if (metadata.costComparable !== isCostComparable) {
    changes.push(`costComparable=${isCostComparable}`);
    metadata.costComparable = isCostComparable;
  }
  if (!isCostComparable && metadata.invalidForCost !== true) {
    changes.push('invalidForCost=true (excluded from cross-bundle cost comparison)');
    metadata.invalidForCost = true;
  }

  if (changes.length) {
    metadata.corrections = [
      ...(metadata.corrections ?? []),
      { date: new Date().toISOString().slice(0, 10), reason: 'integrity reissue (Fugu-response audit)', changes },
    ];
  }
  return { changed: changes.length > 0, changes, isCostComparable };
}

function correctSummary(summary, isCostComparable) {
  const m = summary?.headlineMetrics;
  if (!m) return false;
  let changed = false;
  if (m.primaryMetric !== 'autonomous_completion_rate') {
    m.primaryMetric = 'autonomous_completion_rate';
    changed = true;
  }
  if (m.vs_human_speedup && !m.vs_human_speedup.secondary && !m.vs_human_speedup.suppressed) {
    m.vs_human_speedup = { ...m.vs_human_speedup, secondary: true };
    changed = true;
  }
  if (!isCostComparable) {
    for (const key of ['cost_per_task_cents', 'generation_cost_per_task_cents', 'judging_cost_per_task_cents']) {
      if (m[key] && !m[key].suppressed) {
        m[key] = { ...m[key], value: null, suppressed: true, reason: 'telemetry not fully measured; cost not comparable' };
        changed = true;
      }
    }
  }
  return changed;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}
async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const entries = await readdir(resultsDir);
  const bundles = [];
  for (const name of entries) {
    const dir = path.join(resultsDir, name);
    if (!(await stat(dir)).isDirectory()) continue;
    const metaPath = path.join(dir, 'metadata.json');
    let metadata;
    try {
      metadata = await readJson(metaPath);
    } catch {
      continue;
    }
    const summaryPath = path.join(dir, 'summary.json');
    let summary = null;
    try {
      summary = await readJson(summaryPath);
    } catch {}

    const { changed, changes, isCostComparable } = correctMetadata(metadata);
    const summaryChanged = summary ? correctSummary(summary, isCostComparable) : false;

    bundles.push({ name, dir, metadata, summary, metaPath, summaryPath, changed: changed || summaryChanged, changes });

    if (changed || summaryChanged) {
      console.log(`\n${name}`);
      for (const c of changes) console.log(`   - ${c}`);
      if (summaryChanged) console.log('   - summary headlineMetrics finalized (speedup demoted / cost suppressed)');
      if (WRITE) {
        await writeJson(metaPath, metadata);
        if (summary) await writeJson(summaryPath, summary);
      }
    }
  }

  // regenerate results/index.json from corrected bundles
  const index = {
    generatedAt: new Date().toISOString(),
    note: 'Generated by reissue-bundles.mjs from validated bundle manifests. Do not hand-edit.',
    weeks: bundles
      .map((b) => ({
        id: b.metadata.benchmarkWeek ?? b.name,
        path: `results/${b.name}`,
        benchmarkVersion: b.metadata.benchmarkVersion ?? null,
        taskCount: b.metadata.taskCount ?? null,
        providers: b.metadata.providers ?? [],
        models: b.metadata.models ?? [],
        costComparable: b.metadata.costComparable ?? null,
        telemetryCoverage: b.metadata.telemetryCoverage ?? null,
        headlineEligible: false,
        headlineMetrics: b.summary?.headlineMetrics ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  if (WRITE) await writeJson(path.join(resultsDir, 'index.json'), index);

  const changedCount = bundles.filter((b) => b.changed).length;
  console.log(`\n${WRITE ? 'WROTE' : 'DRY-RUN'}: ${changedCount}/${bundles.length} bundles corrected; index has ${index.weeks.length} weeks.`);
  if (!WRITE) console.log('Re-run with --write to apply.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
