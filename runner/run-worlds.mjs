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
import { filterWorldsBySplit } from './lib/corpus-splits.mjs';
import { buildWorldRunReport } from './lib/world-reporting.mjs';
import {
  buildDifficultySchedule,
  materializeWorldForEpisode,
  worldGeneratorMetadata,
} from './lib/parametric-worlds.mjs';
import { loadManifestBoundRunConfig } from './lib/run-manifest.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');
const manifestConfig = await loadManifestBoundRunConfig(args);
const provider = manifestConfig.provider;
const model = manifestConfig.model;
const k = manifestConfig.k;
const arms = manifestConfig.arms;
const concurrency = Math.max(1, Number(args.concurrency ?? 4));
const bonN = Math.max(2, Number(args.bonN ?? 3));
const difficultyLevels = args.difficultyLevels ? Math.max(1, Number(args.difficultyLevels)) : null;
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
const selected = filterWorldsBySplit(byId, manifestConfig.split);

const jobs = [];
for (const world of selected) {
  const difficulties = difficultiesForWorld(world);
  for (const arm of arms) {
    if (arm === 'restart' && !world.restart) continue; // skip worlds without segmentation support
    for (const difficulty of difficulties) {
      for (let i = 1; i <= k; i += 1) {
        const difficultySuffix = difficulty ? `-${difficulty.id}` : '';
        jobs.push({
          world,
          arm,
          difficulty,
          seedIndex: i,
          episodeId: `${world.id}${difficultySuffix}-${arm}-e${i}`,
        });
      }
    }
  }
}

console.log(`Running ${jobs.length} episodes: ${selected.length} world(s) x ${arms.join('/')} x k=${k} on ${provider}:${model}.`);

const episodes = await mapWithConcurrency(jobs, concurrency, async (job, index) => {
  process.stdout.write(`[${index + 1}/${jobs.length}] ${job.episodeId}\n`);
  try {
    const worldForEpisode = materializeWorldForEpisode(job.world, {
      seedIndex: job.seedIndex,
      difficulty: job.difficulty,
    });
    const provenance = {
      baseWorldId: job.world.id,
      seedIndex: job.seedIndex,
      difficulty: worldForEpisode.difficulty ?? job.difficulty ?? null,
    };
    if (job.arm === 'restart') return { ...(await runRestartEpisode({ world: worldForEpisode, provider, model, episodeId: job.episodeId })), ...provenance };
    if (job.arm === 'bon') return { ...(await runBestOfNEpisode({ world: worldForEpisode, provider, model, episodeId: job.episodeId, n: bonN })), ...provenance };
    return { ...(await runEpisode({ world: worldForEpisode, arm: job.arm, provider, model, episodeId: job.episodeId })), ...provenance };
  } catch (error) {
    console.error(`  ${job.episodeId} FAILED: ${error instanceof Error ? error.message : error}`);
    return {
      episodeId: job.episodeId,
      baseWorldId: job.world.id,
      seedIndex: job.seedIndex,
      difficulty: job.difficulty ?? null,
      worldId: job.world.id,
      arm: job.arm,
      model,
      failed: true,
      error: String(error),
      pass: false,
      dimensions: {},
      weg: { totalTokens: 0, costCents: 0, toolCallCount: 0 },
    };
  }
});

const report = buildWorldRunReport({
  worlds: selected,
  arms,
  k,
  episodes,
  provider,
  model,
  strictHeadline: Boolean(args.strictHeadline),
});
const outDir = path.resolve(repoRoot, 'results', outName);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'episodes.json'), `${JSON.stringify(episodes, null, 2)}\n`);
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote results/${outName}/report.json and episodes.json`);
printReport(report);

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

function difficultiesForWorld(world) {
  const manifestDifficulties = manifestConfig.difficultySchedule
    .filter((level) => level.worldGeneratorId === world.id)
    .map((level) => ({
      id: String(level.levelId),
      label: String(level.label ?? level.levelId),
      knobs: level.knobs,
      difficultyScore: Number(level.difficultyScore),
    }));
  if (manifestDifficulties.length > 0) return manifestDifficulties;
  const generator = worldGeneratorMetadata(world);
  if (!generator) return [null];
  return buildDifficultySchedule(generator, difficultyLevels ? { levels: difficultyLevels } : {});
}

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') p.provider = argv[++i];
    else if (a === '--model') p.model = argv[++i];
    else if (a === '--k') p.k = argv[++i];
    else if (a === '--arms') p.arms = argv[++i];
    else if (a === '--run-manifest') p.runManifest = argv[++i];
    else if (a === '--evaluation-manifest') p.evaluationManifest = argv[++i];
    else if (a === '--model-manifest-id') p.modelManifestId = argv[++i];
    else if (a === '--world') p.world = argv[++i];
    else if (a === '--split') p.split = argv[++i];
    else if (a === '--concurrency') p.concurrency = argv[++i];
    else if (a === '--bon-n') p.bonN = argv[++i];
    else if (a === '--difficulty-levels') p.difficultyLevels = argv[++i];
    else if (a === '--out') p.out = argv[++i];
    else if (a === '--strict-headline') p.strictHeadline = true;
  }
  return p;
}
