#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { recordOutreachAction, validateOutreachActionLedger } from './lib/outreach-action-ledger.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const ledgerPath = path.resolve(repoRoot, args.ledger ?? 'results/sota-outreach-action-ledger.example.json');
  const outPath = path.resolve(repoRoot, args.out ?? args.ledger ?? 'results/sota-outreach-action-ledger.example.json');
  const ledgerResult = await readJsonResult(ledgerPath);

  if (!ledgerResult.ok) {
    console.log(JSON.stringify({ ok: false, ledger: path.relative(repoRoot, ledgerPath), errors: [ledgerResult.error] }, null, 2));
    process.exit(1);
  }

  let updated;
  try {
    updated = recordOutreachAction(ledgerResult.value, {
      actionId: args.actionId,
      status: args.status ?? 'completed',
      completedAt: args.completedAt ?? new Date().toISOString(),
      operator: args.operator ?? null,
      receiptChannel: args.receiptChannel ?? null,
      receiptRef: args.receiptRef ?? null,
      receiptUrl: args.receiptUrl ?? null,
      notes: args.notes ?? null,
    });
  } catch (error) {
    console.log(JSON.stringify({ ok: false, ledger: path.relative(repoRoot, ledgerPath), errors: [error?.message ?? String(error)] }, null, 2));
    process.exit(1);
  }

  const validation = validateOutreachActionLedger(updated, {
    strict: true,
    now: args.completedAt ?? new Date().toISOString(),
  });
  if (validation.ok) {
    await writeFile(outPath, `${JSON.stringify(updated, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        ok: validation.ok,
        ledger: path.relative(repoRoot, ledgerPath),
        out: path.relative(repoRoot, outPath),
        validation,
      },
      null,
      2
    )
  );
  process.exit(validation.ok ? 0 : 1);
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
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ledger') parsed.ledger = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--action-id') parsed.actionId = argv[++index];
    else if (arg === '--status') parsed.status = argv[++index];
    else if (arg === '--completed-at') parsed.completedAt = argv[++index];
    else if (arg === '--operator') parsed.operator = argv[++index];
    else if (arg === '--receipt-channel') parsed.receiptChannel = argv[++index];
    else if (arg === '--receipt-ref') parsed.receiptRef = argv[++index];
    else if (arg === '--receipt-url') parsed.receiptUrl = argv[++index];
    else if (arg === '--notes') parsed.notes = argv[++index];
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
