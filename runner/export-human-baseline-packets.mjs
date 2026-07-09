#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildHumanBaselineSessionPackets,
  validateHumanBaselinePlan,
} from './lib/human-baseline-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const planPath = path.resolve(repoRoot, args.plan ?? 'results/human-baseline-plan.example.json');
  const plan = await readJson(planPath);
  const planValidation = validateHumanBaselinePlan(plan, { strict: args.strictPlan });
  const { ok, errors, packetDocument } = buildHumanBaselineSessionPackets(plan, {
    includeCompleted: args.includeCompleted,
  });

  if (args.out) {
    await writeFile(path.resolve(repoRoot, args.out), `${JSON.stringify(packetDocument, null, 2)}\n`);
  }

  const result = {
    ok: ok && planValidation.ok,
    plan: path.relative(repoRoot, planPath),
    out: args.out ?? null,
    planValidation,
    buildErrors: errors,
    packetDocument,
  };

  console.log(JSON.stringify(args.full ? result : compactResult(result), null, 2));
  process.exit(result.ok ? 0 : 1);
}

function compactResult(result) {
  return {
    ok: result.ok,
    plan: result.plan,
    out: result.out,
    planValidation: result.planValidation,
    buildErrors: result.buildErrors,
    summary: result.packetDocument.summary,
    samples: {
      firstPacket: result.packetDocument.packets[0] ?? null,
      lastPacket: result.packetDocument.packets.at?.(-1) ??
        (result.packetDocument.packets.length ? result.packetDocument.packets[result.packetDocument.packets.length - 1] : null),
    },
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseArgs(argv) {
  const parsed = { includeCompleted: false, strictPlan: false, full: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') parsed.plan = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--include-completed') parsed.includeCompleted = true;
    else if (arg === '--strict-plan') parsed.strictPlan = true;
    else if (arg === '--full') parsed.full = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
