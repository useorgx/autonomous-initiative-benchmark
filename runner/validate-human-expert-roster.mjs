#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateHumanExpertRosterDocument } from './lib/human-expert-roster.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const rosterPath = path.resolve(repoRoot, args.roster ?? 'results/human-expert-roster.json');
  const registryPath = path.resolve(repoRoot, args.registry ?? 'worlds/corpus-splits.json');
  const rosterResult = await readJsonResult(rosterPath);
  const registryResult = await readJsonResult(registryPath);
  if (!rosterResult.ok || !registryResult.ok) {
    const result = {
      ok: false,
      roster: path.relative(repoRoot, rosterPath),
      registry: path.relative(repoRoot, registryPath),
      errors: [
        ...(rosterResult.ok ? [] : [`roster: ${rosterResult.error}`]),
        ...(registryResult.ok ? [] : [`registry: ${registryResult.error}`]),
      ],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  const roster = rosterResult.value;
  const registry = registryResult.value;
  const validation = validateHumanExpertRosterDocument(roster, {
    registry,
    strict: args.strict,
  });
  const result = {
    ok: validation.ok,
    roster: path.relative(repoRoot, rosterPath),
    registry: path.relative(repoRoot, registryPath),
    validation,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

async function readJsonResult(filePath) {
  try {
    return { ok: true, value: JSON.parse(await readFile(filePath, 'utf8')) };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: false, error: `${path.relative(repoRoot, filePath)} does not exist` };
    }
    return { ok: false, error: error?.message ?? String(error) };
  }
}

function parseArgs(argv) {
  const parsed = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--roster') parsed.roster = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
