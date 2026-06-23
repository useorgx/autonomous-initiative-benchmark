#!/usr/bin/env node
// Phase 1 driver: run both arms (raw best-effort tool agent vs OrgX loop) over
// the instrumented worlds, k times each, score with deterministic validators,
// and emit a reliability/economy uplift report. No LLM judge anywhere — the
// Oracle is code.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { runEpisode, runRestartEpisode, runBestOfNEpisode } from './lib/world-engine.mjs';
import { requireProviderKey } from './lib/providers.mjs';
import { computeCorpusEligibility, filterWorldsBySplit } from './lib/corpus-splits.mjs';
import { recoveryScore } from './lib/resilience-metrics.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');
const provider = args.provider || 'openrouter';
const model = args.model || 'deepseek/deepseek-v4-flash';
const k = Math.max(1, Number(args.k ?? 5));
const arms = (args.arms || 'raw,orgx').split(',');
const concurrency = Math.max(1, Number(args.concurrency ?? 4));
const bonN = Math.max(2, Number(args.bonN ?? 3));
const outName = args.out || 'worlds-run';

requireProviderKey(provider);

const worldsDir = path.join(repoRoot, 'worlds', 'instrumented');
const worldFiles = (await readdir(worldsDir))
  .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
  .sort();
const worlds = [];
for (const f of worldFiles) {
  const mod = await import(path.join(worldsDir, f));
  if (mod.world) worlds.push(mod.world);
}
const byId = args.world ? worlds.filter((w) => w.id === args.world) : worlds;
// Optional --split filter (public_validation | private_holdout | ...). Headline
// numbers must come from the private_holdout split only; see corpus-splits.json.
const selected = filterWorldsBySplit(byId, args.split);

const jobs = [];
for (const world of selected) {
  for (const arm of arms) {
    if (arm === 'restart' && !world.restart) continue; // skip worlds without segmentation support
    for (let i = 1; i <= k; i += 1) {
      jobs.push({ world, arm, episodeId: `${world.id}-${arm}-e${i}` });
    }
  }
}

console.log(`Running ${jobs.length} episodes: ${selected.length} world(s) x ${arms.join('/')} x k=${k} on ${provider}:${model}.`);

const episodes = await mapWithConcurrency(jobs, concurrency, async (job, index) => {
  process.stdout.write(`[${index + 1}/${jobs.length}] ${job.episodeId}\n`);
  try {
    if (job.arm === 'restart') return await runRestartEpisode({ world: job.world, provider, model, episodeId: job.episodeId });
    if (job.arm === 'bon') return await runBestOfNEpisode({ world: job.world, provider, model, episodeId: job.episodeId, n: bonN });
    return await runEpisode({ world: job.world, arm: job.arm, provider, model, episodeId: job.episodeId });
  } catch (error) {
    console.error(`  ${job.episodeId} FAILED: ${error instanceof Error ? error.message : error}`);
    return { episodeId: job.episodeId, worldId: job.world.id, arm: job.arm, model, failed: true, error: String(error), pass: false, dimensions: {}, weg: { totalTokens: 0, costCents: 0, toolCallCount: 0 } };
  }
});

const report = buildReport(selected, arms, k, episodes, { provider, model });
const outDir = path.resolve(repoRoot, 'results', outName);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'episodes.json'), `${JSON.stringify(episodes, null, 2)}\n`);
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote results/${outName}/report.json and episodes.json`);
printReport(report);

function buildReport(worlds, arms, k, episodes, meta) {
  const DIMS = ['outcome', 'method', 'coordination', 'judgment', 'trust'];
  const byKey = (worldId, arm) => episodes.filter((e) => e.worldId === worldId && e.arm === arm);

  const perWorld = worlds.map((world) => {
    const armStats = {};
    for (const arm of arms) {
      const eps = byKey(world.id, arm);
      const passes = eps.filter((e) => e.pass).length;
      const passAtK = eps.length ? passes / eps.length : 0;
      const passPowK = eps.length && eps.every((e) => e.pass) ? 1 : 0; // all k succeed
      const tokens = avg(eps.map((e) => e.weg?.totalTokens ?? 0));
      const cost = avg(eps.map((e) => e.weg?.costCents ?? 0));
      const toolCalls = avg(eps.map((e) => e.weg?.toolCallCount ?? 0));
      const dims = Object.fromEntries(DIMS.map((d) => [d, avg(eps.map((e) => Number(e.dimensions?.[d] ?? 0)))]));
      const qualityPerKToken = tokens > 0 ? Number((passAtK / (tokens / 1000)).toFixed(4)) : 0;
      // Fugu orchestration overhead: how much of the token spend is coordination.
      const orchTokens = avg(eps.map((e) => (e.weg?.orchInputTokens ?? 0) + (e.weg?.orchOutputTokens ?? 0)));
      const orchestrationRatio = tokens > 0 ? Number((orchTokens / tokens).toFixed(4)) : 0;
      // Resilience: when a world injects failures, score recovery for this arm.
      const injections = eps.map((e) => e.injection).filter(Boolean);
      const recovery = injections.length ? recoveryScore(injections) : null;
      armStats[arm] = {
        n: eps.length,
        passAtK: round(passAtK),
        passPowK,
        meanTokens: Math.round(tokens),
        meanCostCents: round(cost),
        meanToolCalls: round(toolCalls),
        qualityPerKToken,
        meanOrchestrationTokens: Math.round(orchTokens),
        orchestrationRatio,
        dimensions: Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, round(v)])),
        recovery,
        failures: eps.filter((e) => e.failed).length,
      };
    }
    // ARC-style admission: a world has headroom for an orchestration layer to
    // capture only if the raw baseline does NOT already saturate it at pass^k.
    const rawSat = (armStats.raw?.passAtK ?? 0) >= 1;
    return { worldId: world.id, domain: world.domain, admission: rawSat ? 'saturated' : 'admitted', arms: armStats };
  });

  // Uplift of every non-raw arm vs raw (the honest control).
  const uplift = {};
  if (arms.includes('raw')) {
    for (const arm of arms.filter((a) => a !== 'raw')) {
      const present = perWorld.some((w) => w.arms[arm]);
      if (!present) continue;
      const worldsWith = perWorld.filter((w) => w.arms[arm]);
      const dimsAgg = {};
      for (const d of DIMS) {
        const raw = avg(worldsWith.map((w) => w.arms.raw?.dimensions?.[d] ?? 0));
        const a = avg(worldsWith.map((w) => w.arms[arm]?.dimensions?.[d] ?? 0));
        dimsAgg[d] = { raw: round(raw), arm: round(a), uplift: round(a - raw) };
      }
      const m = (sel) => round(avg(worldsWith.map(sel)));
      uplift[arm] = {
        passAtK: { raw: m((w) => w.arms.raw?.passAtK ?? 0), arm: m((w) => w.arms[arm].passAtK), uplift: round(m((w) => w.arms[arm].passAtK) - m((w) => w.arms.raw?.passAtK ?? 0)) },
        passPowK: { raw: m((w) => w.arms.raw?.passPowK ?? 0), arm: m((w) => w.arms[arm].passPowK), uplift: round(m((w) => w.arms[arm].passPowK) - m((w) => w.arms.raw?.passPowK ?? 0)) },
        qualityPerKToken: { raw: m((w) => w.arms.raw?.qualityPerKToken ?? 0), arm: m((w) => w.arms[arm].qualityPerKToken), uplift: round(m((w) => w.arms[arm].qualityPerKToken) - m((w) => w.arms.raw?.qualityPerKToken ?? 0)) },
        meanTokens: { raw: Math.round(avg(worldsWith.map((w) => w.arms.raw?.meanTokens ?? 0))), arm: Math.round(avg(worldsWith.map((w) => w.arms[arm].meanTokens))) },
        dimensions: dimsAgg,
      };
    }
  }
  const admitted = perWorld.filter((w) => w.admission === 'admitted').length;
  return {
    admissionSummary: { admitted, saturated: perWorld.length - admitted, rule: 'admitted if raw baseline pass@k < 1.0 (headroom exists)' },
    benchmark: 'orgx-bench-v2-instrumented-worlds',
    // Headline-eligibility per corpus-splits.json: in-repo worlds are public /
    // contamination-visible and must NOT be reported as headline numbers.
    corpus: computeCorpusEligibility(worlds),
    generatedAtNote: 'timestamp stamped by caller',
    provider: meta.provider,
    model: meta.model,
    k,
    arms,
    worldCount: worlds.length,
    scoring: 'deterministic validators only (no LLM judge)',
    perWorld,
    uplift,
  };
}

function printReport(report) {
  if (report.corpus && !report.corpus.headlineEligible) {
    console.log(
      `\n⚠️  NOT HEADLINE-ELIGIBLE — split(s): ${report.corpus.splits.join(', ')}.\n   ${report.corpus.note}`
    );
  }
  console.log('\n=== UPLIFT (each arm vs raw, deterministic) ===');
  const uplift = report.uplift ?? {};
  const arms = Object.keys(uplift);
  if (arms.length === 0) {
    console.log('(no comparison arms vs raw)');
    return;
  }
  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
  for (const arm of arms) {
    const u = uplift[arm];
    if (!u?.passAtK) continue;
    console.log(`\n[${arm}]`);
    console.log(`  pass@k:         raw ${u.passAtK.raw}  ->  ${u.passAtK.arm}   (${sign(u.passAtK.uplift)})`);
    console.log(`  pass^k (all-k): raw ${u.passPowK.raw}  ->  ${u.passPowK.arm}   (${sign(u.passPowK.uplift)})`);
    console.log(`  quality/Ktoken: raw ${u.qualityPerKToken.raw}  ->  ${u.qualityPerKToken.arm}   (${sign(u.qualityPerKToken.uplift)})`);
    console.log(`  mean tokens:    raw ${u.meanTokens.raw}  ->  ${u.meanTokens.arm}   (${(u.meanTokens.arm / Math.max(1, u.meanTokens.raw)).toFixed(2)}x)`);
    for (const [d, v] of Object.entries(u.dimensions ?? {})) {
      console.log(`    ${d.padEnd(16)} ${v.raw} -> ${v.arm}   (${sign(v.uplift)})`);
    }
  }
}

async function mapWithConcurrency(items, width, mapper) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await mapper(items[i], i); }
  }));
  return out;
}

function avg(a) { return a.length ? a.reduce((x, y) => x + Number(y || 0), 0) / a.length : 0; }
function round(n) { return Number(Number(n).toFixed(3)); }

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') p.provider = argv[++i];
    else if (a === '--model') p.model = argv[++i];
    else if (a === '--k') p.k = argv[++i];
    else if (a === '--arms') p.arms = argv[++i];
    else if (a === '--world') p.world = argv[++i];
    else if (a === '--concurrency') p.concurrency = argv[++i];
    else if (a === '--bon-n') p.bonN = argv[++i];
    else if (a === '--out') p.out = argv[++i];
  }
  return p;
}
