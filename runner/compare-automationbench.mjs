#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAutomationBenchReport, sha256 } from './lib/automationbench-report.mjs';

export async function compareFromFile(manifestFile) {
  const absolute = path.resolve(manifestFile);
  const bytes = await readFile(absolute);
  const manifest = JSON.parse(bytes);
  const inputs = [];
  if (!Array.isArray(manifest.runs)) throw new Error('Manifest runs array required (may be empty)');
  for (const run of manifest.runs) {
    const payload = await readFile(path.resolve(path.dirname(absolute), run.file));
    if (sha256(payload) !== run.sha256) throw new Error(`Export digest mismatch: ${run.file}`);
    let costs = {};
    if (run.costs_file) {
      const costBytes = await readFile(path.resolve(path.dirname(absolute), run.costs_file));
      if (sha256(costBytes) !== run.costs_sha256) throw new Error('Cost receipt digest mismatch');
      costs = JSON.parse(costBytes);
    }
    inputs.push({ arm: run.arm, repetition: run.repetition, data: JSON.parse(payload), costs });
  }
  return { ...buildAutomationBenchReport(manifest, inputs), manifestSha256: sha256(bytes) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestFile, outputFile] = process.argv.slice(2);
  if (!manifestFile) { console.error('Usage: node runner/compare-automationbench.mjs manifest.json [report.json]'); process.exitCode = 2; }
  else {
    try {
      const report = JSON.stringify(await compareFromFile(manifestFile), null, 2) + '\n';
      if (outputFile) await writeFile(outputFile, report); else process.stdout.write(report);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
