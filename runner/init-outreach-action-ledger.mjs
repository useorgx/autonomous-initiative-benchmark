#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildOutreachActionLedger } from './lib/outreach-action-ledger.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const draftsPath = path.resolve(repoRoot, args.drafts ?? 'results/sota-outreach-drafts.example.json');
  const outPath = path.resolve(repoRoot, args.out ?? 'results/sota-outreach-action-ledger.example.json');
  const draftResult = await readJsonResult(draftsPath);

  if (!draftResult.ok) {
    console.log(JSON.stringify({ ok: false, drafts: path.relative(repoRoot, draftsPath), errors: [draftResult.error] }, null, 2));
    process.exit(1);
  }

  const result = buildOutreachActionLedger(draftResult.value, {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    strict: !args.noStrict,
  });
  if (result.ledger) {
    await writeFile(outPath, `${JSON.stringify(result.ledger, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        drafts: path.relative(repoRoot, draftsPath),
        out: path.relative(repoRoot, outPath),
        summary: result.ledger?.summary ?? null,
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2
    )
  );
  process.exit(result.ok ? 0 : 1);
}

async function readJsonResult(filePath) {
  try {
    return { ok: true, value: JSON.parse(await readFile(filePath, 'utf8')) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, error: `${path.relative(repoRoot, filePath)} does not exist` };
    return { ok: false, error: error?.message ?? String(error) };
  }
}

function parseArgs(argv) {
  const parsed = { noStrict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--drafts') parsed.drafts = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--generated-at') parsed.generatedAt = argv[++index];
    else if (arg === '--no-strict') parsed.noStrict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
