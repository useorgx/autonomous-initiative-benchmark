#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  collectReplicationRowsFromMetadata,
  summarizeReplicationRows,
  validateReplicationEvidenceDocument,
} from './lib/replication-evidence.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));

if (isMain()) {
  const result = args.file
    ? await validateReplicationEvidenceFile({
        filePath: path.resolve(repoRoot, args.file),
        strict: args.strict,
      })
    : await validateReplicationEvidence({
        resultsDir: path.resolve(repoRoot, args.resultsDir ?? 'results'),
        strict: args.strict,
      });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok || args.allowEmpty ? 0 : 1);
}

export async function validateReplicationEvidence({ resultsDir, strict = false } = {}) {
  const bundles = [];
  let entries = [];
  try {
    entries = await readdir(resultsDir, { withFileTypes: true });
  } catch {
    return {
      ok: !strict,
      resultsDir: path.relative(repoRoot, resultsDir),
      rows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: strict ? ['results directory not found'] : [],
    };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadataPath = path.join(resultsDir, entry.name, 'metadata.json');
    const metadata = await readJson(metadataPath, null);
    if (!metadata) continue;
    const rows = collectReplicationRowsFromMetadata(metadata);
    if (rows.length > 0) bundles.push({ bundle: entry.name, rows });
  }

  const allRows = bundles.flatMap((bundle) =>
    bundle.rows.map((row) => ({ ...row, bundle: bundle.bundle }))
  );
  const summary = summarizeReplicationRows(allRows);
  const ok = summary.ok && (!strict || summary.validRows > 0);
  return {
    ok,
    resultsDir: path.relative(repoRoot, resultsDir),
    strict,
    bundlesWithReplication: bundles.length,
    rows: summary.rows,
    validRows: summary.validRows,
    invalidRows: summary.invalidRows,
    independentParties: summary.independentParties,
    replicatedWorlds: summary.replicatedWorlds,
    agreementWithinCiRows: summary.agreementWithinCiRows,
    errors: [
      ...summary.errors.map((error) => `row[${error.index}]: ${error.error}`),
      ...(strict && summary.validRows === 0 ? ['strict mode requires at least one valid third-party replication row'] : []),
    ],
  };
}

export async function validateReplicationEvidenceFile({ filePath, strict = false } = {}) {
  const document = await readJson(filePath, null);
  if (!document) {
    return {
      ok: false,
      file: filePath ? path.relative(repoRoot, filePath) : null,
      strict,
      rows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: ['replication evidence file is missing or invalid JSON'],
      warnings: [],
    };
  }

  const validation = validateReplicationEvidenceDocument(document, { strict });
  return {
    file: path.relative(repoRoot, filePath),
    ok: validation.ok,
    strict,
    releaseId: validation.release_id,
    generatedAt: validation.generated_at,
    rows: validation.summary.rows,
    validRows: validation.summary.validRows,
    invalidRows: validation.summary.invalidRows,
    independentParties: validation.summary.independentParties,
    replicatedWorlds: validation.summary.replicatedWorlds,
    agreementWithinCiRows: validation.summary.agreementWithinCiRows,
    errors: validation.errors,
    warnings: validation.warnings,
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
  const parsed = { strict: false, allowEmpty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--results-dir') parsed.resultsDir = argv[++index];
    else if (arg === '--file') parsed.file = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
    else if (arg === '--allow-empty') parsed.allowEmpty = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
}
