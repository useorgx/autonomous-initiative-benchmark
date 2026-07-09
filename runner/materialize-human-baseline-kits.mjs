#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildHumanBaselineSessionPackets } from './lib/human-baseline-plan.mjs';
import {
  buildHumanBaselineSessionKits,
  validateHumanBaselineSessionKits,
} from './lib/human-baseline-session-kits.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const planPath = path.resolve(repoRoot, args.plan ?? 'results/human-baseline-plan.example.json');
  const outPath = path.resolve(repoRoot, args.out ?? 'results/human-baseline-session-kits.example.json');
  const outDir = args.outDir ?? 'results/human-baseline-kits';
  const planResult = await readJsonResult(planPath);

  if (!planResult.ok) {
    console.log(JSON.stringify({ ok: false, plan: path.relative(repoRoot, planPath), errors: [planResult.error] }, null, 2));
    process.exit(1);
  }

  const packets = buildHumanBaselineSessionPackets(planResult.value, {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    includeCompleted: args.includeCompleted,
  });
  if (!packets.ok) {
    console.log(JSON.stringify({ ok: false, plan: path.relative(repoRoot, planPath), errors: packets.errors }, null, 2));
    process.exit(1);
  }

  const kits = buildHumanBaselineSessionKits(packets.packetDocument, {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    outputDir: outDir,
  });
  if (kits.kitDocument) {
    await writeFile(outPath, `${JSON.stringify(kits.kitDocument, null, 2)}\n`);
    await mkdir(path.resolve(repoRoot, outDir), { recursive: true });
    await Promise.all(
      kits.kitDocument.kits.map((kit) =>
        writeFile(path.resolve(repoRoot, kit.file_path), `${kit.markdown}\n`)
      )
    );
    await writeFile(
      path.resolve(repoRoot, outDir, 'README.md'),
      `${renderIndex(kits.kitDocument)}\n`
    );
  }

  const validation = kits.kitDocument
    ? validateHumanBaselineSessionKits(kits.kitDocument, { strict: !args.noStrict })
    : null;
  const result = {
    ok: kits.ok && (validation?.ok ?? false),
    plan: path.relative(repoRoot, planPath),
    out: path.relative(repoRoot, outPath),
    outDir,
    summary: kits.kitDocument?.summary ?? null,
    errors: [...kits.errors, ...(validation?.errors ?? [])],
    warnings: [...new Set([...kits.warnings, ...(validation?.warnings ?? [])])],
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function renderIndex(kitDocument) {
  const lines = [
    '# Human Baseline Session Kits',
    '',
    `Generated: ${kitDocument.generated_at}`,
    `Protocol: ${kitDocument.protocol_version}`,
    `Kits: ${kitDocument.summary.kits}`,
    `Assigned: ${kitDocument.summary.assigned_kits}`,
    `Unassigned: ${kitDocument.summary.unassigned_kits}`,
    '',
    '| Kit | Status | Domain | Assignee | Due |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const kit of kitDocument.kits) {
    lines.push(
      `| [${kit.packet_id}](${path.basename(kit.file_path)}) | ${kit.status} | ${kit.domain ?? ''} | ${kit.assignee_id ?? ''} | ${kit.due_at ?? ''} |`
    );
  }
  lines.push('');
  lines.push('These kits are participant/recruiting handoffs only. They do not contain private validators, private solution materials, or grader output.');
  return lines.join('\n');
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
  const parsed = { includeCompleted: false, noStrict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') parsed.plan = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--out-dir') parsed.outDir = argv[++index];
    else if (arg === '--generated-at') parsed.generatedAt = argv[++index];
    else if (arg === '--include-completed') parsed.includeCompleted = true;
    else if (arg === '--no-strict') parsed.noStrict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
