#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateStrangerReproductionReceipt } from './lib/stranger-reproduction.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateStrangerReproductionEvidence({
    manifestPath: path.resolve(repoRoot, args.manifest ?? 'results/sota-release-manifest.example.json'),
    receiptPath: args.receipt ? path.resolve(repoRoot, args.receipt) : null,
    strict: args.strict,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok || args.allowMissing ? 0 : 1);
}

export async function validateStrangerReproductionEvidence({ manifestPath, receiptPath = null, strict = false } = {}) {
  const manifest = receiptPath ? null : await readJson(manifestPath, null);
  const manifestReceiptPath = manifest?.evidence?.strangerReproductionReceiptPath ?? null;
  const resolvedReceiptPath = receiptPath ?? (manifestReceiptPath ? path.resolve(repoRoot, manifestReceiptPath) : null);

  if (!resolvedReceiptPath) {
    return {
      ok: false,
      strict,
      manifest: manifestPath ? path.relative(repoRoot, manifestPath) : null,
      receipt: null,
      errors: ['strangerReproductionReceiptPath is not set; pass --receipt <path> after an outside reviewer records one'],
      warnings: [],
    };
  }

  const receipt = await readJson(resolvedReceiptPath, null);
  if (!receipt) {
    return {
      ok: false,
      strict,
      manifest: manifestPath ? path.relative(repoRoot, manifestPath) : null,
      receipt: path.relative(repoRoot, resolvedReceiptPath),
      errors: ['stranger reproduction receipt is missing or invalid JSON'],
      warnings: [],
    };
  }

  const validation = validateStrangerReproductionReceipt(receipt, { strict });
  return {
    receipt: path.relative(repoRoot, resolvedReceiptPath),
    ...validation,
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const parsed = { strict: false, allowMissing: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') parsed.strict = true;
    else if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (arg === '--receipt') parsed.receipt = argv[++index];
    else if (arg === '--allow-missing') parsed.allowMissing = true;
    else if (!parsed.receipt) parsed.receipt = arg;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
