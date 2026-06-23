#!/usr/bin/env node
// Regime + mechanism-attribution runner over a paired-counterfactual world.
//
// Runs each arm on the CLEAN and STRESSED twins (same task, stressor is the only
// difference), k times each, and reports Qualified Mission Success per cell, the
// raw-baseline regime (easy/borderline/blocked), and — for every non-raw arm —
// the mechanism DIFFERENTIAL (uplift under stress minus uplift when clean). A
// real mechanism helps mostly when its stressor is present; ~0 differential on
// the clean twin is the falsification check.
//
// Usage:
//   SAKANA_API_KEY=... node runner/run-regime.mjs --provider fugu --model fugu-ultra --arms raw --k 8 --out regime-fugu
//   OPENROUTER_API_KEY=... node runner/run-regime.mjs --provider openrouter --model deepseek/deepseek-v4-flash --arms raw,orgx3 --k 12 --out regime-deepseek
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { runEpisode, runBestOfNEpisode } from './lib/world-engine.mjs';
import { requireProviderKey } from './lib/providers.mjs';
import { makeWorld as makeSilentCorruption } from '../worlds/instrumented/silent-corruption-reconciliation.mjs';
import { makeWorld as makeMajorityTrap } from '../worlds/instrumented/trust-majority-trap.mjs';
import { qualifiedMissionSuccess, classifyRegime, mechanismDifferential, unnecessaryOrchestrationRate, rescueHarm, pairByKey } from './lib/mission-metrics.mjs';

const WORLDS = {
  'silent-corruption-reconciliation': makeSilentCorruption,
  'trust-majority-trap': makeMajorityTrap,
};

const args = parseArgs(process.argv.slice(2));
const provider = args.provider || 'openrouter';
const model = args.model || 'deepseek/deepseek-v4-flash';
const k = Math.max(1, Number(args.k ?? 8));
const arms = (args.arms || 'raw').split(',');
const concurrency = Math.max(1, Number(args.concurrency ?? 3));
const repoRoot = path.resolve(import.meta.dirname, '..');
const outName = args.out || 'regime-run';
const worldName = args.world || 'silent-corruption-reconciliation';
const makeWorld = WORLDS[worldName];
if (!makeWorld) throw new Error(`Unknown world "${worldName}". Known: ${Object.keys(WORLDS).join(', ')}`);
requireProviderKey(provider);

const TWINS = [
  { twin: 'clean', cfg: { corrupt: false } },
  { twin: 'stressed', cfg: { corrupt: true } },
];

const jobs = [];
for (const arm of arms) for (const t of TWINS) for (let i = 1; i <= k; i += 1) {
  jobs.push({ arm, twin: t.twin, cfg: t.cfg, episodeId: `${t.twin}-${arm}-e${i}` });
}
console.log(`Regime run: ${jobs.length} episodes (${arms.join('/')} x clean+stressed x k=${k}) on ${provider}:${model}`);

const episodes = await mapWithConcurrency(jobs, concurrency, async (job, idx) => {
  process.stdout.write(`[${idx + 1}/${jobs.length}] ${job.episodeId}\n`);
  const world = makeWorld(job.cfg);
  try {
    const ep = job.arm === 'bon'
      ? await runBestOfNEpisode({ world, provider, model, episodeId: job.episodeId })
      : await runEpisode({ world, arm: job.arm, provider, model, episodeId: job.episodeId });
    return { ...ep, arm: job.arm, twin: job.twin };
  } catch (e) {
    return { episodeId: job.episodeId, arm: job.arm, twin: job.twin, failed: true, error: String(e), pass: false, dimensions: {}, weg: {} };
  }
});

const cell = (arm, twin) => episodes.filter((e) => e.arm === arm && e.twin === twin);
const rate = (eps) => (eps.length ? Number((eps.filter(qualifiedMissionSuccess).length / eps.length).toFixed(4)) : 0);

const perArm = {};
for (const arm of arms) {
  perArm[arm] = {
    cleanSuccess: rate(cell(arm, 'clean')),
    stressedSuccess: rate(cell(arm, 'stressed')),
  };
}
const rawRegime = {
  clean: classifyRegime(perArm.raw?.cleanSuccess ?? 0),
  stressed: classifyRegime(perArm.raw?.stressedSuccess ?? 0),
};
const differentials = {};
for (const arm of arms.filter((a) => a !== 'raw')) {
  differentials[arm] = mechanismDifferential({
    rawClean: cell('raw', 'clean'),
    armClean: cell(arm, 'clean'),
    rawStressed: cell('raw', 'stressed'),
    armStressed: cell(arm, 'stressed'),
  });
  const pairsStressed = pairByKey(cell('raw', 'stressed'), cell(arm, 'stressed'), (e) => e.episodeId.replace(`-${e.arm}-`, '-'));
  differentials[arm].unnecessaryOrchestration = unnecessaryOrchestrationRate(
    pairByKey(cell('raw', 'clean'), cell(arm, 'clean'), (e) => e.episodeId.replace(`-${e.arm}-`, '-'))
  );
  differentials[arm].stressedRescueHarm = rescueHarm(pairsStressed);
}

const report = {
  benchmark: 'orgx-bench-v3-regime',
  world: worldName,
  provider, model, k, arms,
  scoring: 'Qualified Mission Success (pass AND no integrity violation), deterministic',
  rawRegime,
  perArm,
  differentials,
  note: 'Paired counterfactual: stressor (silent corruption) is the only difference between twins. Public/diagnostic, not headline.',
};

const outDir = path.resolve(repoRoot, 'results', outName);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'episodes.json'), `${JSON.stringify(episodes, null, 2)}\n`);
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('\n=== REGIME (Qualified Mission Success) ===');
console.log(`raw: clean=${perArm.raw?.cleanSuccess} [${rawRegime.clean}]  stressed=${perArm.raw?.stressedSuccess} [${rawRegime.stressed}]`);
console.log(`stressor effect on raw: ${perArm.raw?.cleanSuccess} -> ${perArm.raw?.stressedSuccess} (${(((perArm.raw?.stressedSuccess ?? 0) - (perArm.raw?.cleanSuccess ?? 0))).toFixed(3)})`);
for (const arm of arms.filter((a) => a !== 'raw')) {
  const d = differentials[arm];
  console.log(`\n[${arm}] clean=${perArm[arm].cleanSuccess} stressed=${perArm[arm].stressedSuccess}`);
  console.log(`  uplift vs raw: clean ${d.upliftClean}  stressed ${d.upliftStressed}  DIFFERENTIAL ${d.differential}`);
  console.log(`  unnecessary-orchestration (clean): ${JSON.stringify(d.unnecessaryOrchestration)}`);
}
console.log(`\nWrote results/${outName}/report.json`);

function mapWithConcurrency(items, width, mapper) {
  const out = new Array(items.length);
  let next = 0;
  return Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await mapper(items[i], i); }
  })).then(() => out);
}
function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--provider') p.provider = argv[++i];
    else if (a === '--model') p.model = argv[++i];
    else if (a === '--k') p.k = argv[++i];
    else if (a === '--arms') p.arms = argv[++i];
    else if (a === '--concurrency') p.concurrency = argv[++i];
    else if (a === '--world') p.world = argv[++i];
    else if (a === '--out') p.out = argv[++i];
  }
  return p;
}
