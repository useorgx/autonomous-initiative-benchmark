#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildDimensionIndependenceReport,
  makeSyntheticDimensionAuditEpisodes,
} from './lib/dimension-independence.mjs';

const args = parseArgs(process.argv.slice(2));
const episodes = args.episodes
  ? await readEpisodes(path.resolve(process.cwd(), args.episodes))
  : makeSyntheticDimensionAuditEpisodes();
const report = buildDimensionIndependenceReport(episodes, {
  maxAbsCorrelation: Number(args.maxAbsCorrelation ?? 0.85),
  minPairedObservations: Number(args.minPairedObservations ?? 8),
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);

async function readEpisodes(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.episodes)) return parsed.episodes;
  throw new Error(`${file} must contain an episode array or { "episodes": [...] }`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--episodes') parsed.episodes = argv[++index];
    else if (arg === '--max-abs-correlation') parsed.maxAbsCorrelation = argv[++index];
    else if (arg === '--min-paired-observations') parsed.minPairedObservations = argv[++index];
  }
  return parsed;
}

