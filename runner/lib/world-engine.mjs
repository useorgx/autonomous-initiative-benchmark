// Environment-grounded episode engine for instrumented Initiative Worlds.
//
// A "world" is a sandboxed job: the agent reaches state ONLY through tools
// (it never sees fixtures or validators), completes a multi-step task with
// dependencies and a blocker under a budget, and the outcome is checked by
// DETERMINISTIC validators — not an LLM judge. This is the τ-bench / WebArena
// state-checked design, adapted to measure orchestration uplift.
//
// Two arms, same base model, same tools, same competent base prompt:
//   - raw:  best-effort single agent + tools (finalizes on first submit)
//   - orgx: same + plan/decompose + a GROUNDED verification gate on the
//           irreversible submit (re-derive each field via tools, no-regression)
// The only variable is the loop architecture, so uplift is attributable to
// orchestration, not the model or the prompt.
import { performance } from 'node:perf_hooks';

import { chatUsageCostCents, getProvider, normalizeChatUsage, requireProviderKey } from './providers.mjs';

const MAX_RETRIES = 4;

const BASE_SYSTEM = [
  'You are an autonomous operator completing a real task. You have tools and you must use them — the answer is NOT in the prompt; it is in the data behind the tools.',
  'Discipline: gather every fact you need via tools before concluding; verify every number you state by actually querying or computing it; never invent values.',
  'If a required input is missing or two sources irreconcilably contradict, do not guess — call the escalate tool with exactly what is missing and who must provide it.',
  'When and only when you are done, call the submit tool with your final structured answer.',
].join('\n');

const ORGX_SYSTEM = [
  BASE_SYSTEM,
  '',
  'You operate inside the OrgX execution loop. Two standing rules:',
  '1. Decompose first: before acting, list the sub-tasks and their dependencies (which result feeds which), then execute in dependency order — do not start a step until the input it depends on is established via tools.',
  '2. Verify before you finalize: a submit is irreversible, so before finalizing you will be asked to re-derive each field from the tools. Keep an answer only if the tools confirm it; correct it only when a tool shows it is wrong (never change a value the tools already confirmed).',
].join('\n');

// `chatFn` is injectable so the gate/guard control flow can be tested
// deterministically without a provider key or LLM call (default = real chat).
export async function runEpisode({ world, arm, provider, model, episodeId, maxSteps = 18, maxOutputTokens = 6000, timeoutMs = 120_000, chatFn = chat }) {
  const started = performance.now();
  const state = world.initState();
  const weg = { nodes: [], toolCalls: [], promptTokens: 0, completionTokens: 0, totalTokens: 0, costCents: 0, modelTurns: 0 };
  const tools = world.tools.map(toToolSchema);
  // Arm config. 'orgx' = reflexive gate v1 (Phase 1: harmful). 'orgx2' = gate
  // v2.0: same grounded re-derivation BUT with a hard no-regression guard —
  // the validated draft is kept if the verification pass runs past budget, so
  // the loop can never lower a result the agent already produced.
  const usesGate = arm === 'orgx' || arm === 'orgx2';
  const draftFallback = arm === 'orgx2';
  const system = usesGate ? ORGX_SYSTEM : BASE_SYSTEM;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: world.prompt },
  ];

  let verificationOffered = false;
  let gateDraft = null;
  let terminal = null;

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await chatFn({ provider, model, messages, tools, maxOutputTokens, timeoutMs });
    accUsage(weg, response.usage);
    weg.modelTurns += 1;
    const msg = response.choices?.[0]?.message ?? {};
    const calls = msg.tool_calls ?? [];

    if (!calls.length) {
      // Model answered without a tool call. Nudge once toward the contract.
      messages.push({ role: 'assistant', content: msg.content ?? '' });
      messages.push({ role: 'user', content: 'Use a tool. To finish, call submit; to escalate, call escalate. Do not answer in prose.' });
      weg.nodes.push({ type: 'no_tool_nudge', step });
      continue;
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });

    for (const call of calls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
      const tool = world.tools.find((t) => t.name === name);
      weg.toolCalls.push({ step, name, args });

      if (!tool) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: `Error: unknown tool "${name}".` });
        continue;
      }

      // Terminal tools: submit / escalate.
      if (tool.terminal) {
        // OrgX grounded-verification gate: on the FIRST submit only, bounce
        // back one re-derivation pass (confidence-gated on the irreversible
        // step). escalate is not bounced.
        if (usesGate && name === 'submit' && !verificationOffered) {
          verificationOffered = true;
          gateDraft = args; // v2.0 no-regression: remember the validated draft
          weg.nodes.push({ type: 'verification_gate', step, draft: args });
          messages.push({ role: 'tool', tool_call_id: call.id, content: world.verificationPrompt(args) });
          messages.push({ role: 'user', content: 'Before this is accepted: re-derive each field above using the tools. Re-query and recompute. Then call submit again — unchanged if the tools confirm it, corrected only where a tool proves it wrong.' });
          continue;
        }
        const finalArgs = tool.handler(args, state) ?? args;
        terminal = { kind: name, submission: finalArgs };
        weg.nodes.push({ type: name, step, submission: finalArgs });
        break;
      }

      const result = tool.handler(args, state);
      weg.nodes.push({ type: 'tool_result', step, name });
      messages.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
    }

    if (terminal) break;
  }

  if (!terminal) {
    // v2.0 no-regression guard: if the verification pass blew the budget but
    // the agent had already produced a validated draft, keep the draft instead
    // of failing empty. This is what makes the gate incapable of lowering a
    // result the agent already had.
    if (draftFallback && gateDraft) {
      terminal = { kind: 'submit', submission: gateDraft, recoveredFromDraft: true };
      weg.nodes.push({ type: 'no_regression_fallback' });
    } else {
      terminal = { kind: 'timeout', submission: state.submission ?? null };
      weg.nodes.push({ type: 'budget_exhausted' });
    }
  }

  const durationSeconds = Number(((performance.now() - started) / 1000).toFixed(2));
  const scored = world.validate({ terminal, weg, state });

  return {
    episodeId,
    worldId: world.id,
    arm,
    model,
    durationSeconds,
    terminalKind: terminal.kind,
    submission: terminal.submission,
    weg: { ...weg, toolCallCount: weg.toolCalls.length },
    ...scored, // { pass, dimensions: {...}, detail }
  };
}

// Restart-at-boundary arm: process the job in segments, each in a FRESH
// context that receives only the carried verified state. Kills state drift by
// keeping each working context small. Requires world.restart.
export async function runRestartEpisode({ world, provider, model, episodeId, maxStepsPerSegment = 12, maxOutputTokens = 6000, timeoutMs = 120_000 }) {
  const started = performance.now();
  const spec = world.restart;
  const weg = { nodes: [], toolCalls: [], promptTokens: 0, completionTokens: 0, totalTokens: 0, costCents: 0, modelTurns: 0, segments: 0 };
  let carry = spec.initCarry();
  const n = Math.ceil(spec.totalItems / spec.segmentSize);

  for (let seg = 0; seg < n; seg += 1) {
    const lo = seg * spec.segmentSize;
    const hi = Math.min(spec.totalItems, lo + spec.segmentSize);
    const tools = spec.segmentTools(carry, lo, hi);
    const messages = [
      { role: 'system', content: BASE_SYSTEM },
      { role: 'user', content: spec.segmentPrompt(lo, hi, n) },
    ];
    weg.segments += 1;
    let segmentResult = null;

    for (let step = 0; step < maxStepsPerSegment && !segmentResult; step += 1) {
      const response = await chat({ provider, model, messages, tools: tools.map(toToolSchema), maxOutputTokens, timeoutMs });
      accUsage(weg, response.usage);
      weg.modelTurns += 1;
      const msg = response.choices?.[0]?.message ?? {};
      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        messages.push({ role: 'assistant', content: msg.content ?? '' });
        messages.push({ role: 'user', content: 'Use a tool. Call submit_segment when this segment is done.' });
        continue;
      }
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
        const tool = tools.find((t) => t.name === name);
        weg.toolCalls.push({ segment: seg, name });
        if (!tool) { messages.push({ role: 'tool', tool_call_id: call.id, content: `Error: unknown tool "${name}".` }); continue; }
        if (tool.terminal) { segmentResult = tool.handler(args); weg.nodes.push({ type: 'segment_submit', segment: seg }); break; }
        const result = tool.handler(args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
      }
    }
    if (!segmentResult) { weg.nodes.push({ type: 'segment_timeout', segment: seg }); break; }
    carry = spec.foldCarry(carry, segmentResult);
  }

  const submission = spec.finalSubmission(carry);
  const terminal = { kind: 'submit', submission };
  // Method flag: restart used segment tools to query the data.
  const state = { ...world.initState(), queriedOrders: true, queriedInventory: true, queriedInvoices: true, usedCompute: true };
  const scored = world.validate({ terminal, weg, state });
  return {
    episodeId, worldId: world.id, arm: 'restart', model,
    durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    terminalKind: terminal.kind, submission,
    weg: { ...weg, toolCallCount: weg.toolCalls.length },
    ...scored,
  };
}

function toToolSchema(tool) {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

function accUsage(weg, usage) {
  const u = normalizeChatUsage(usage ?? {});
  weg.promptTokens += u.input_tokens;
  weg.completionTokens += u.output_tokens;
  weg.totalTokens += u.total_tokens || u.input_tokens + u.output_tokens;
  weg.costCents += chatUsageCostCents(usage ?? {}) ?? 0;
}

async function chat({ provider, model, messages, tools, maxOutputTokens, timeoutMs }) {
  const cfg = getProvider(provider);
  const apiKey = requireProviderKey(provider);
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          reasoning: { effort: 'low' },
          max_tokens: maxOutputTokens,
        }),
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${provider} ${res.status}: ${body.slice(0, 300)}`);
      return JSON.parse(body);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_RETRIES) throw new Error(`chat failed after ${MAX_RETRIES}: ${lastError}`);
      await new Promise((r) => setTimeout(r, 750 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
}
