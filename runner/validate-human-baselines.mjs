#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { validateHumanBaselineCoverage } from './lib/human-baselines.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));

if (isMain()) {
  const result = await validateHumanBaselineFiles({
    registryPath: path.resolve(repoRoot, args.registry ?? 'worlds/corpus-splits.json'),
    baselinePath: path.resolve(repoRoot, args.baselines ?? 'results/human-baselines.jsonl'),
    summaryOutPath: args.summaryOut
      ? path.resolve(repoRoot, args.summaryOut)
      : path.resolve(repoRoot, 'results/human-baseline-summary.json'),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok || args.allowIncomplete ? 0 : 1);
}

export async function validateHumanBaselineFiles({
  registryPath,
  baselinePath,
  summaryOutPath = null,
} = {}) {
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const baselines = await readJsonlIfExists(baselinePath);
  const holdoutWorlds = registry?.splits?.private_holdout?.worlds ?? [];
  const result = validateHumanBaselineCoverage({ baselines, holdoutWorlds });
  if (summaryOutPath) {
    await writeFile(summaryOutPath, `${JSON.stringify(result.summary, null, 2)}\n`);
  }
  return {
    ok: result.ok,
    baselinePath: path.relative(repoRoot, baselinePath),
    targetWorlds: result.target_worlds,
    worldsWithMinimumHumans: result.worlds_with_minimum_humans,
    missingWorldCount: result.missing_worlds.length,
    underBaselineWorldCount: result.under_baseline_worlds.length,
    summary: result.summary,
    ...(result.ok
      ? {}
      : {
          errors: [
            ...(result.missing_worlds.length
              ? [`${result.missing_worlds.length} holdout worlds have no human baselines`]
              : []),
            ...(result.under_baseline_worlds.length
              ? [`${result.under_baseline_worlds.length} holdout worlds have incomplete protocol-valid baselines`]
              : []),
            ...(!result.summary.protocol_eligible && result.summary.samples > 0
              ? [`${result.summary.protocol_error_count} human baseline records fail the timed-expert protocol`]
              : []),
          ],
        }),
  };
}

async function readJsonlIfExists(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function parseArgs(argv) {
  const parsed = { allowIncomplete: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--baselines') parsed.baselines = argv[++index];
    else if (arg === '--summary-out') parsed.summaryOut = argv[++index];
    else if (arg === '--allow-incomplete') parsed.allowIncomplete = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
}
