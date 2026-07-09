#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateHumanBaselineSessionKits } from './lib/human-baseline-session-kits.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const kitsPath = path.resolve(repoRoot, args.kits ?? 'results/human-baseline-session-kits.example.json');
  const kitsResult = await readJsonResult(kitsPath);

  if (!kitsResult.ok) {
    console.log(JSON.stringify({ ok: false, kits: path.relative(repoRoot, kitsPath), errors: [kitsResult.error] }, null, 2));
    process.exit(1);
  }

  const validation = validateHumanBaselineSessionKits(kitsResult.value, { strict: args.strict });
  console.log(
    JSON.stringify(
      {
        ok: validation.ok,
        kits: path.relative(repoRoot, kitsPath),
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
  const parsed = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--kits') parsed.kits = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
