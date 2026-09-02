import { createHash } from 'node:crypto';
import { validateManifest, sha256 } from './automationbench-report.mjs';

const LEDGER_SCHEMA = 'orgx.automationbench-ledger/v2';
const GENESIS_HASH = '0'.repeat(64);
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function initialTranscript(messages) {
  const initial = [];
  for (const message of messages ?? []) {
    if (message?.role === 'assistant') break;
    initial.push({
      role: String(message?.role ?? ''),
      content: message?.content ?? null,
      ...(message?.name ? { name: String(message.name) } : {}),
    });
  }
  return initial;
}

export function transcriptRootHash(messages) {
  return createHash('sha256').update(stableJson(initialTranscript(messages))).digest('hex');
}

export function parseLedgerJsonl(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`); }
  });
}

export function verifyLedgerChain(events) {
  let previous = GENESIS_HASH;
  const errors = [];
  for (let index = 0; index < (events ?? []).length; index += 1) {
    const event = events[index];
    const sequence = index + 1;
    if (event?.ledgerSequence !== sequence) errors.push(`event ${sequence}: ledgerSequence mismatch`);
    if (event?.prevHash !== previous) errors.push(`event ${sequence}: prevHash mismatch`);
    const { eventHash, ...unsigned } = event ?? {};
    const expected = createHash('sha256').update(stableJson(unsigned)).digest('hex');
    if (eventHash !== expected) errors.push(`event ${sequence}: eventHash mismatch`);
    if (typeof eventHash === 'string') previous = eventHash;
  }
  return { valid: errors.length === 0, errors, tailHash: events?.at(-1)?.eventHash ?? GENESIS_HASH };
}

function usageOf(events) {
  return events.reduce((totals, event) => {
    totals.input += Number(event.usage?.prompt_tokens ?? 0);
    totals.output += Number(event.usage?.completion_tokens ?? 0);
    totals.total += Number(event.usage?.total_tokens ?? 0);
    return totals;
  }, { input: 0, output: 0, total: 0 });
}

function component(kind, model, events) {
  if (!events.length) return null;
  return {
    kind,
    model,
    calls: events.length,
    usd: events.reduce((sum, event) => sum + Number(event.costUsd ?? 0), 0),
  };
}

export function reconcileAutomationBenchLedger({ manifest, armId, exportData, ledgerBytes }) {
  const validated = validateManifest(manifest);
  const arm = validated.arms.find((candidate) => candidate.id === armId);
  assert(arm, `Unknown arm: ${armId}`);
  assert(exportData?.meta?.model === arm.runner_model, 'Export runner model does not match arm');
  assert(Array.isArray(exportData?.tasks), 'Native AutomationBench export tasks[] required');

  const rowsByRoot = new Map();
  for (const row of exportData.tasks) {
    assert(typeof row.name === 'string' && validated.tasks.some((task) => task.name === row.name), `Unregistered export task: ${row.name}`);
    assert(Array.isArray(row.messages) && row.messages.length > 0, `Task transcript required: ${row.name}`);
    const rootHash = transcriptRootHash(row.messages);
    assert(!rowsByRoot.has(rootHash), `Transcript root collision: ${row.name} and ${rowsByRoot.get(rootHash)?.name}`);
    rowsByRoot.set(rootHash, row);
  }

  const events = parseLedgerJsonl(ledgerBytes);
  assert(events.length > 0, 'Usage ledger is empty');
  const chain = verifyLedgerChain(events);
  assert(chain.valid, `Invalid usage ledger chain: ${chain.errors.join('; ')}`);
  const eventsByRoot = new Map();
  for (const event of events) {
    assert(event?.schema === LEDGER_SCHEMA, 'Unknown usage ledger schema');
    assert(typeof event.rootHash === 'string' && rowsByRoot.has(event.rootHash), `Usage ledger contains an unknown transcript root: ${event.rootHash}`);
    assert(event.arm === arm.proxy_arm, 'Usage ledger proxy arm mismatch');
    assert(event.claimLevel === arm.claim_level, 'Usage ledger claim level mismatch');
    assert(event.requestedModel === arm.runner_model, 'Usage ledger runner model mismatch');
    assert(event.baseModel === arm.base_model, 'Usage ledger base model mismatch');
    assert(event.runtimeCommit === arm.runtime_commit, 'Usage ledger runtime commit mismatch');
    assert(event.policyHash === arm.policy_hash, 'Usage ledger policy hash mismatch');
    const group = eventsByRoot.get(event.rootHash) ?? [];
    group.push(event);
    eventsByRoot.set(event.rootHash, group);
  }

  const ledgerDigest = sha256(Buffer.isBuffer(ledgerBytes) ? ledgerBytes : Buffer.from(String(ledgerBytes)));
  const costs = {};
  const tasks = [];
  for (const [rootHash, row] of rowsByRoot) {
    const taskEvents = eventsByRoot.get(rootHash) ?? [];
    const episodeIds = new Set(taskEvents.map((event) => event.episodeId).filter(Boolean));
    const primarySucceeded = taskEvents.filter((event) => event.stage === 'primary' && event.status === 'succeeded');
    const reviewSucceeded = taskEvents.filter((event) => event.stage === 'review' && event.status === 'succeeded');
    const failedModelCalls = taskEvents.filter((event) => ['primary', 'review'].includes(event.stage) && event.status === 'failed');
    const decisions = taskEvents.filter((event) => event.stage === 'policy' && event.status === 'decided');
    const reviewFallbacks = taskEvents.filter((event) => event.stage === 'review_fallback');
    const successfulModelCalls = [...primarySucceeded, ...reviewSucceeded];
    const callKeys = successfulModelCalls.map((event) => `${event.episodeId}\0${event.providerCallIndex}`);
    const duplicateCallIdentity = new Set(callKeys).size !== callKeys.length;
    const usage = usageOf(successfulModelCalls);
    const usageReconciled = usage.input === Number(row.input_tokens ?? -1) && usage.output === Number(row.output_tokens ?? -1);
    const costsKnown = successfulModelCalls.every((event) => finite(event.costUsd));
    const reviewDecisions = decisions.filter((event) => event.intervene === true).length;
    const policyComplete = decisions.length === primarySucceeded.length && reviewDecisions === reviewSucceeded.length;
    const reasons = [];
    if (episodeIds.size !== 1) reasons.push(`expected one episode id, found ${episodeIds.size}`);
    if (primarySucceeded.length < 1) reasons.push('no successful primary model call');
    if (failedModelCalls.length) reasons.push(`${failedModelCalls.length} failed model call(s)`);
    if (reviewFallbacks.length) reasons.push(`${reviewFallbacks.length} review fallback(s)`);
    if (duplicateCallIdentity) reasons.push('duplicate episode/provider-call identity');
    if (!policyComplete) reasons.push('policy/model-call counts do not reconcile');
    if (!usageReconciled) reasons.push(`usage mismatch ledger=${usage.input}/${usage.output} export=${row.input_tokens}/${row.output_tokens}`);
    if (!costsKnown) reasons.push('one or more model calls have unknown cost');

    const complete = reasons.length === 0;
    const components = [
      component('primary', arm.base_model, primarySucceeded),
      component('verification', arm.base_model, reviewSucceeded),
    ].filter(Boolean);
    costs[row.name] = {
      complete,
      scope: 'all_model_calls_and_orchestration',
      usage_ledger_sha256: ledgerDigest,
      usage_ledger_tail_sha256: chain.tailHash,
      usage_reconciled: usageReconciled,
      components,
      telemetry: {
        transcript_root_sha256: rootHash,
        episode_id: episodeIds.size === 1 ? [...episodeIds][0] : null,
        primary_calls: primarySucceeded.length,
        verification_calls: reviewSucceeded.length,
        failed_model_calls: failedModelCalls.length,
        review_fallbacks: reviewFallbacks.length,
        duplicate_call_identity: duplicateCallIdentity,
        reasons,
      },
    };
    tasks.push({ name: row.name, complete, usageReconciled, reasons });
  }

  return {
    schema: 'orgx.automationbench-cost-reconciliation/v2',
    arm: arm.id,
    runnerModel: arm.runner_model,
    baseModel: arm.base_model,
    usageLedgerSha256: ledgerDigest,
    usageLedgerTailSha256: chain.tailHash,
    tasks,
    costs,
    complete: tasks.length === exportData.tasks.length && tasks.every((task) => task.complete),
  };
}
