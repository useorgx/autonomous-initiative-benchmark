#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileAutomationBenchLedger } from './lib/automationbench-ledger.mjs';

export async function reconcileFromFiles({ manifestFile, arm, exportFile, ledgerFile }) {
  const [manifestBytes, exportBytes, ledgerBytes] = await Promise.all([
    readFile(path.resolve(manifestFile)),
    readFile(path.resolve(exportFile)),
    readFile(path.resolve(ledgerFile)),
  ]);
  return reconcileAutomationBenchLedger({
    manifest: JSON.parse(manifestBytes),
    armId: arm,
    exportData: JSON.parse(exportBytes),
    ledgerBytes,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestFile, arm, exportFile, ledgerFile, outputFile] = process.argv.slice(2);
  if (!manifestFile || !arm || !exportFile || !ledgerFile || !outputFile) {
    console.error('Usage: node runner/reconcile-automationbench-ledger.mjs manifest.json arm export.json ledger.jsonl costs.json');
    process.exitCode = 2;
  } else {
    try {
      const report = await reconcileFromFiles({ manifestFile, arm, exportFile, ledgerFile });
      await writeFile(path.resolve(outputFile), `${JSON.stringify(report.costs, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ complete: report.complete, tasks: report.tasks }, null, 2)}\n`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
