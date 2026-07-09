#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createInitialSotaExecutionLedger, validateSotaExecutionLedger } from './lib/sota-execution-ledger.mjs';
import { buildSotaSweepPlan } from './lib/sota-sweep-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(repoRoot, args.manifest ?? 'results/sota-release-manifest.example.json');
  const releaseManifest = await readJson(manifestPath);
  const registryPath = path.resolve(repoRoot, args.registry ?? releaseManifest.evidence?.registryPath ?? 'worlds/corpus-splits.json');
  const registry = await readJson(registryPath);
  const plan = buildSotaSweepPlan({ releaseManifest, registry, includeJobs: true });

  if (args.initOut) {
    const ledger = createInitialSotaExecutionLedger({
      plan,
      releaseManifestPath: path.relative(repoRoot, manifestPath),
      registryPath: path.relative(repoRoot, registryPath),
    });
    const outPath = path.resolve(repoRoot, args.initOut);
    await writeFile(outPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = validateSotaExecutionLedger({ ledger, plan, strict: args.strict });
    printResult({ result, manifestPath, registryPath, ledgerPath: outPath, initialized: true });
    process.exit(result.ok ? 0 : 1);
  }

  const ledgerPath = path.resolve(repoRoot, args.ledger ?? releaseManifest.evidence?.executionLedgerPath ?? '');
  if (!args.ledger && !releaseManifest.evidence?.executionLedgerPath) {
    console.error('Missing execution ledger path. Pass --ledger <file> or set evidence.executionLedgerPath.');
    process.exit(2);
  }

  const ledger = await readJson(ledgerPath);
  const result = validateSotaExecutionLedger({ ledger, plan, strict: args.strict });
  printResult({ result, manifestPath, registryPath, ledgerPath, initialized: false });
  process.exit(result.ok ? 0 : 1);
}

function printResult({ result, manifestPath, registryPath, ledgerPath, initialized }) {
  console.log(
    JSON.stringify(
      {
        initialized,
        manifest: path.relative(repoRoot, manifestPath),
        registry: path.relative(repoRoot, registryPath),
        ledger: path.relative(repoRoot, ledgerPath),
        ...result,
      },
      null,
      2
    )
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseArgs(argv) {
  const parsed = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--ledger') parsed.ledger = argv[++index];
    else if (arg === '--init-out') parsed.initOut = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
    else if (!parsed.ledger) parsed.ledger = arg;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
