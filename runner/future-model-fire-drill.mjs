#!/usr/bin/env node
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildFutureModelFireDrillRecord } from './lib/future-model-drill.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, '..');
const worlds = await loadInstrumentedWorlds(repoRoot);
const record = buildFutureModelFireDrillRecord({
  worlds,
  provider: args.provider ?? 'openai',
  model: args.model ?? 'gpt-6-fire-drill-stub',
  split: args.split ?? 'public_validation',
  k: Number(args.k ?? 2),
  arms: args.arms ? args.arms.split(',').map((arm) => arm.trim()).filter(Boolean) : ['raw', 'orgx'],
});

if (args.out) {
  const outPath = path.resolve(process.cwd(), args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`);
}

console.log(JSON.stringify(record, null, 2));
process.exit(record.ok ? 0 : 1);

async function loadInstrumentedWorlds(repoRoot) {
  const worldsDir = path.join(repoRoot, 'worlds', 'instrumented');
  const files = (await readdir(worldsDir))
    .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'))
    .sort();
  const worlds = [];
  for (const file of files) {
    const module = await import(path.join(worldsDir, file));
    if (module.world) worlds.push(module.world);
  }
  return worlds;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--provider') parsed.provider = argv[++index];
    else if (arg === '--model') parsed.model = argv[++index];
    else if (arg === '--split') parsed.split = argv[++index];
    else if (arg === '--k') parsed.k = argv[++index];
    else if (arg === '--arms') parsed.arms = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
  }
  return parsed;
}

