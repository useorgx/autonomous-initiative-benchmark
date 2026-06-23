// Fugu pricing + orchestration-token accounting.
//
// Fugu Ultra (fugu-ultra-20260615) has FIXED, transparent pricing, so we can
// compute exact cost from the usage payload — including orchestration tokens,
// which Sakana bills at the same rate as standard tokens and which it (to its
// credit) exposes in token_details. Regular `fugu` bills at "the top-tier
// underlying model's rate" — a hidden, route-dependent number — so its dollar
// cost is reported `unknown`. That asymmetry is itself a finding.

// USD per 1M tokens.
const ULTRA = {
  standard: { input: 5, cachedInput: 0.5, output: 30 },
  hiContext: { input: 10, cachedInput: 1.0, output: 45 }, // context > 272K
  hiThreshold: 272_000,
};

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// Pull a normalized view from either chat (prompt_/completion_) or responses
// (input_/output_) usage shapes.
export function readFuguUsage(usage = {}) {
  const pd = usage.prompt_tokens_details ?? usage.input_tokens_details ?? {};
  const cd = usage.completion_tokens_details ?? usage.output_tokens_details ?? {};
  return {
    input: num(usage.prompt_tokens ?? usage.input_tokens),
    output: num(usage.completion_tokens ?? usage.output_tokens),
    total: num(usage.total_tokens),
    cached: num(pd.cached_tokens),
    orchInput: num(pd.orchestration_input_tokens),
    orchInputCached: num(pd.orchestration_input_cached_tokens),
    orchOutput: num(cd.orchestration_output_tokens),
  };
}

// Exact Fugu Ultra cost in cents. Orchestration tokens are billed at the same
// rate and added on top of the user-visible input/output.
export function fuguUltraCostCents(usage = {}) {
  const u = readFuguUsage(usage);
  const hi = u.input + u.orchInput > ULTRA.hiThreshold;
  const rate = hi ? ULTRA.hiContext : ULTRA.standard;
  const cachedTotal = u.cached + u.orchInputCached;
  const billableInput = u.input - u.cached + (u.orchInput - u.orchInputCached);
  const billableOutput = u.output + u.orchOutput;
  const usd =
    (billableInput / 1_000_000) * rate.input +
    (cachedTotal / 1_000_000) * rate.cachedInput +
    (billableOutput / 1_000_000) * rate.output;
  return Number((usd * 100).toFixed(6));
}

// Orchestration overhead ratio = orchestration tokens / total tokens.
// The "how much am I paying for the coordination?" number.
export function orchestrationRatio(usage = {}) {
  const u = readFuguUsage(usage);
  const orch = u.orchInput + u.orchOutput;
  const total = u.total || u.input + u.output + orch;
  return total > 0 ? Number((orch / total).toFixed(4)) : 0;
}

// Cost dispatcher: exact for Ultra, null (unknown) for regular fugu.
export function fuguCostCents(model, usage = {}) {
  if (typeof model === 'string' && model.includes('fugu-ultra')) return fuguUltraCostCents(usage);
  return null; // regular fugu: route-dependent rate, not computable from tokens
}
