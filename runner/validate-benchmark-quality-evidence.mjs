#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  validateContaminationAudit,
  validateCorrectionLedger,
  validateStatisticalPrecisionReport,
  validateWorldQualityAudit,
} from './lib/benchmark-quality-evidence.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));

if (!args.kind || !args.file) {
  console.error('Usage: node runner/validate-benchmark-quality-evidence.mjs --kind <world-quality|contamination|precision|corrections> --file <path> [--strict] [--registry <path>] [--release-id <id>]');
  process.exit(2);
}

const document = await readJson(resolvePath(args.file));
const registry = args.registry ? await readJson(resolvePath(args.registry)) : null;
const expectedWorldIds = (registry?.splits?.private_holdout?.worlds ?? []).map((world) => world.worldId).filter(Boolean);
const options = { strict: args.strict, expectedWorldIds, releaseId: args.releaseId };
const validators = {
  'world-quality': validateWorldQualityAudit,
  contamination: validateContaminationAudit,
  precision: validateStatisticalPrecisionReport,
  corrections: validateCorrectionLedger,
};
const validate = validators[args.kind];
if (!validate) {
  console.error(`Unknown kind: ${args.kind}`);
  process.exit(2);
}

const validation = validate(document, options);
console.log(JSON.stringify({
  ok: validation.ok,
  kind: args.kind,
  file: path.relative(repoRoot, resolvePath(args.file)),
  strict: args.strict,
  validation,
}, null, 2));
process.exit(validation.ok ? 0 : 1);

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    console.error(`Unable to read JSON from ${path.relative(repoRoot, filePath)}: ${error.message}`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const parsed = { strict: false, registry: 'worlds/corpus-splits.json', releaseId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') parsed.strict = true;
    else if (arg === '--kind') parsed.kind = argv[++index];
    else if (arg === '--file') parsed.file = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--release-id') parsed.releaseId = argv[++index];
  }
  return parsed;
}
