#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { probePublicReceiptAccess } from './lib/ax-protocol.mjs';

const { values } = parseArgs({ options: {
  cli: { type: 'string' }, remote: { type: 'boolean', default: false }, output: { type: 'string' },
} });
if (!values.cli) throw new Error('Use --cli /absolute/path/to/installed/orgx.js [--remote] [--output report.json]');
const cli = resolve(values.cli);
const dir = await mkdtemp(join(tmpdir(), 'orgx-ax-'));
const started = performance.now();
const checks = [];
let receipt;
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', NO_COLOR: '1' };
function command(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 15000, maxBuffer: 1048576,
  });
  if (result.error) throw result.error;
  return result;
}
async function check(name, fn) {
  const start = performance.now();
  try { await fn(); checks.push({ name, passed: true, elapsed_ms: Math.round(performance.now() - start) }); }
  catch (error) { checks.push({ name, passed: false, error: String(error.message ?? error), elapsed_ms: Math.round(performance.now() - start) }); }
}
try {
  const bytes = Buffer.from('OrgX public protocol smoke: hand off a local artifact.\n');
  const artifact = join(dir, 'artifact.txt');
  const receiptPath = join(dir, 'receipt.json');
  await writeFile(artifact, bytes);
  const version = command(['--version']);
  await check('emit_without_credentials', async () => {
    const result = command(['receipt', artifact, '--summary', 'Public synthetic handoff regression', '--out', receiptPath, '--json']);
    if (result.status !== 0) throw new Error(result.stderr || 'Receipt emission failed');
    const output = JSON.parse(result.stdout);
    if (output.ok !== true || output.uploaded !== false || output.verification !== 'unverified' || output.acceptance !== 'pending') throw new Error('Emission overstated its result');
    receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (receipt.artifacts[0]?.digest?.value !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Independent artifact digest mismatch');
  });
  await check('fresh_process_verify', async () => {
    const result = command(['verify', receiptPath, '--json']);
    const output = JSON.parse(result.stdout);
    if (result.status !== 0 || output.ok !== true || !output.checks.some((c) => c.name === 'content_hash' && c.result === 'pass')) throw new Error('Fresh process could not verify receipt integrity');
  });
  await check('tamper_rejected', async () => {
    if (!receipt) throw new Error('No emitted receipt');
    const changed = structuredClone(receipt);
    changed.intent.summary = 'Modified after emission';
    const path = join(dir, 'tampered.json');
    await writeFile(path, JSON.stringify(changed));
    const result = command(['verify', path, '--json']);
    const output = JSON.parse(result.stdout);
    if (result.status !== 1 || output.ok !== false || !output.checks.some((c) => c.name === 'content_hash' && c.result === 'fail')) throw new Error('Tampering did not fail the content hash check');
  });
  if (values.remote) {
    if (receipt) checks.push(...await probePublicReceiptAccess(receipt));
    else checks.push({ name: 'public_http', passed: false, error: 'No emitted receipt' });
  }
  const report = {
    schema_version: 'orgx-ax-protocol-smoke/v1', observed_at: new Date().toISOString(),
    kind: 'deterministic_protocol_smoke', tier: null, autonomous_onboarding_evaluated: false,
    hosted_continuity_evaluated: false, model_calls: 0, human_interventions_during_smoke: 0,
    cli_version: version.status === 0 ? version.stdout.trim() : null,
    cli_sha256: createHash('sha256').update(await readFile(cli)).digest('hex'),
    public_http_evaluated: values.remote, elapsed_ms: Math.round(performance.now() - started),
    ok: checks.length > 0 && checks.every((c) => c.passed), checks,
  };
  if (values.output) await writeFile(resolve(values.output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
