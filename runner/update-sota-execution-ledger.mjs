#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  updateSotaExecutionLedgerEntry,
  validateSotaExecutionLedger,
} from './lib/sota-execution-ledger.mjs';
import { buildSotaSweepPlan } from './lib/sota-sweep-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ledger) fail('Pass --ledger <file>.');
  if (!args.jobId) fail('Pass --job-id <id>.');
  if (!args.status) fail('Pass --status planned|launched|scored|lost|blocked.');
  if (!args.out && !args.inPlace) fail('Pass --out <file> or --in-place.');

  const ledgerPath = path.resolve(repoRoot, args.ledger);
  const ledger = await readJson(ledgerPath);
  const updated = updateSotaExecutionLedgerEntry({
    ledger,
    jobId: args.jobId,
    status: args.status,
    launchedAt: args.launchedAt,
    completedAt: args.completedAt,
    bundleRunId: args.bundleRunId,
    receiptHash: args.receiptHash,
    lossType: args.lossType,
    countedAsLoss: args.countedAsLoss,
    reason: args.reason,
    notes: args.notes,
  });

  let validation = null;
  if (args.manifest) {
    const manifestPath = path.resolve(repoRoot, args.manifest);
    const releaseManifest = await readJson(manifestPath);
    const registryPath = path.resolve(repoRoot, args.registry ?? releaseManifest.evidence?.registryPath ?? 'worlds/corpus-splits.json');
    const registry = await readJson(registryPath);
    const plan = buildSotaSweepPlan({ releaseManifest, registry, includeJobs: true });
    validation = validateSotaExecutionLedger({ ledger: updated, plan, strict: args.strict });
    if (!validation.ok) {
      console.error(JSON.stringify({ ok: false, validation }, null, 2));
      process.exit(1);
    }
  }

  const outPath = path.resolve(repoRoot, args.out ?? args.ledger);
  await writeFile(outPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        ledger: path.relative(repoRoot, ledgerPath),
        out: path.relative(repoRoot, outPath),
        jobId: args.jobId,
        status: args.status,
        accounting: updated.accounting,
        ...(validation ? { validation } : {}),
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
  const parsed = { strict: false, inPlace: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ledger') parsed.ledger = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--in-place') parsed.inPlace = true;
    else if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
    else if (arg === '--job-id') parsed.jobId = argv[++index];
    else if (arg === '--status') parsed.status = argv[++index];
    else if (arg === '--launched-at') parsed.launchedAt = argv[++index];
    else if (arg === '--completed-at') parsed.completedAt = argv[++index];
    else if (arg === '--bundle-run-id') parsed.bundleRunId = argv[++index];
    else if (arg === '--receipt-hash') parsed.receiptHash = argv[++index];
    else if (arg === '--loss-type') parsed.lossType = argv[++index];
    else if (arg === '--reason') parsed.reason = argv[++index];
    else if (arg === '--notes') parsed.notes = argv[++index];
    else if (arg === '--counted-as-loss') parsed.countedAsLoss = parseBoolean(argv[++index]);
  }
  return parsed;
}

function parseBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('--counted-as-loss must be true or false.');
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
