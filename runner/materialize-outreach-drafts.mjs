#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildOutreachDraftPackage } from './lib/outreach-target-plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const planPath = path.resolve(repoRoot, args.plan ?? 'results/sota-outreach-plan.example.json');
  const outPath = path.resolve(repoRoot, args.out ?? 'results/sota-outreach-drafts.example.json');
  const outDir = args.outDir ? path.resolve(repoRoot, args.outDir) : null;
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

  const { ok, errors, warnings, draftPackage } = buildOutreachDraftPackage(planResult.value, {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    strict: !args.noStrict,
    includeIdentified: args.includeIdentified,
  });

  if (draftPackage) {
    await writeFile(outPath, `${JSON.stringify(draftPackage, null, 2)}\n`);
    if (outDir) {
      await mkdir(outDir, { recursive: true });
      await Promise.all(
        draftPackage.drafts.map((draft) =>
          writeFile(path.join(outDir, `${safeFileName(draft.draft_id)}.md`), `${draft.markdown}\n`)
        )
      );
      await writeFile(path.join(outDir, '_action-queue.md'), `${renderActionQueueMarkdown(draftPackage)}\n`);
    }
  }

  const result = {
    ok,
    plan: path.relative(repoRoot, planPath),
    out: path.relative(repoRoot, outPath),
    outDir: outDir ? path.relative(repoRoot, outDir) : null,
    summary: draftPackage?.summary ?? null,
    errors,
    warnings,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
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

function safeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function renderActionQueueMarkdown(draftPackage) {
  const lines = [
    '# Outreach Action Queue',
    '',
    `Generated: ${draftPackage.generated_at}`,
    `Next Recipient Action: ${draftPackage.summary.next_recipient_action_at ?? 'none'}`,
    `Dispatch Ready Now: ${draftPackage.summary.dispatch_ready_now}`,
    '',
  ];

  for (const action of draftPackage.action_queue ?? []) {
    lines.push(`## ${action.target_id}`);
    lines.push('');
    lines.push(`Action: ${action.action_type}`);
    lines.push(`Lane: ${action.lane}`);
    lines.push(`Priority: ${action.priority}`);
    lines.push(`Recipient Facing: ${action.recipient_facing ? 'yes' : 'no'}`);
    lines.push(`Recommended At: ${action.recommended_at ?? 'not scheduled'}`);
    lines.push(`Dispatch Ready Now: ${action.dispatch_ready_now ? 'yes' : 'no'}`);
    lines.push(`Blocked: ${action.blocked ? 'yes' : 'no'}`);
    lines.push(action.block_reasons.length ? `Block Reasons: ${action.block_reasons.join('; ')}` : 'Block Reasons: none');
    lines.push(action.execution_notes.length ? `Execution Notes: ${action.execution_notes.join('; ')}` : 'Execution Notes: none');
    lines.push(`Timing: ${action.timing_note ?? 'none'}`);
    lines.push('');
  }

  return lines.join('\n');
}

function parseArgs(argv) {
  const parsed = { includeIdentified: true, noStrict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') parsed.plan = argv[++index];
    else if (arg === '--out') parsed.out = argv[++index];
    else if (arg === '--out-dir') parsed.outDir = argv[++index];
    else if (arg === '--generated-at') parsed.generatedAt = argv[++index];
    else if (arg === '--exclude-identified') parsed.includeIdentified = false;
    else if (arg === '--no-strict') parsed.noStrict = true;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
