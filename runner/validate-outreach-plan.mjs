#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateOutreachTargetPlan } from './lib/outreach-target-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const planPath = path.resolve(repoRoot, args.plan ?? 'results/sota-outreach-plan.example.json');
  const planResult = await readJsonResult(planPath);

  if (!planResult.ok) {
    const result = {
      ok: false,
      plan: path.relative(repoRoot, planPath),
      errors: [planResult.error],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const validation = validateOutreachTargetPlan(planResult.value, {
    strict: args.strict,
    now: args.now ?? null,
  });
  const result = {
    ok: validation.ok,
    plan: path.relative(repoRoot, planPath),
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
    if (arg === '--plan') parsed.plan = argv[++index];
    else if (arg === '--now') parsed.now = argv[++index];
    else if (arg === '--strict') parsed.strict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
