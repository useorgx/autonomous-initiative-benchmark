#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildSotaSweepPlan, compactSweepPlan } from './lib/sota-sweep-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(repoRoot, args.manifest ?? 'results/sota-release-manifest.example.json');
  const releaseManifest = await readJson(manifestPath);
  const registryPath = path.resolve(repoRoot, args.registry ?? releaseManifest.evidence?.registryPath ?? 'worlds/corpus-splits.json');
  const registry = await readJson(registryPath);
  const plan = buildSotaSweepPlan({ releaseManifest, registry, includeJobs: true });

  if (args.out) {
    const outPath = path.resolve(repoRoot, args.out);
    await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      args.full ? plan : compactSweepPlan(plan),
      null,
      2
    )
  );
  process.exit(plan.ok ? 0 : 1);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseArgs(argv) {
  const parsed = { full: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--full') parsed.full = true;
    else if (!parsed.manifest) parsed.manifest = arg;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
