#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildHumanBaselinePlan, validateHumanBaselinePlan } from './lib/human-baseline-plan.mjs';
import {
  normalizeExpertRosterInput,
  validateHumanExpertRosterDocument,
} from './lib/human-expert-roster.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const registryPath = path.resolve(repoRoot, args.registry ?? 'worlds/corpus-splits.json');
  const baselinePath = path.resolve(repoRoot, args.baselines ?? 'results/human-baselines.jsonl');
  const expertPath = args.experts ? path.resolve(repoRoot, args.experts) : null;
  const registry = await readJson(registryPath);
  const baselines = await readJsonlIfExists(baselinePath);
  const expertDocument = expertPath ? await readJson(expertPath) : [];
  const expertValidation = expertPath
    ? validateHumanExpertRosterDocument(expertDocument, { registry, strict: args.strict })
    : null;
  const experts = normalizeExpertRosterInput(expertDocument);
  const { errors, plan } = buildHumanBaselinePlan({
    registry,
    baselines,
    experts,
    releaseId: args.releaseId ?? null,
  });
  const validation = validateHumanBaselinePlan(plan, { strict: args.strict });
  const result = {
    ok: errors.length === 0 && validation.ok && (expertValidation?.ok ?? true),
    registry: path.relative(repoRoot, registryPath),
    baselines: path.relative(repoRoot, baselinePath),
    experts: expertPath ? path.relative(repoRoot, expertPath) : null,
    expertValidation,
    buildErrors: errors,
    validation,
    plan,
  };

  if (args.out) {
    await writeFile(path.resolve(repoRoot, args.out), `${JSON.stringify(plan, null, 2)}\n`);
  }

  console.log(JSON.stringify(args.full ? result : compactResult(result), null, 2));
  process.exit(result.ok ? 0 : 1);
}

function compactResult(result) {
  return {
    ok: result.ok,
    registry: result.registry,
    baselines: result.baselines,
    experts: result.experts,
    expertValidation: result.expertValidation,
    buildErrors: result.buildErrors,
    validation: result.validation,
    samples: {
      firstWorld: result.plan.worlds[0] ?? null,
      lastWorld: result.plan.worlds.at?.(-1) ?? (result.plan.worlds.length ? result.plan.worlds[result.plan.worlds.length - 1] : null),
    },
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
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
  const parsed = { strict: false, full: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--baselines') parsed.baselines = argv[++index];
    else if (arg === '--experts') parsed.experts = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--release-id') parsed.releaseId = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
    else if (arg === '--full') parsed.full = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
