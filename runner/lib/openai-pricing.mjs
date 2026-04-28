export const OPENAI_PRICING_USD_PER_M = {
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-pro': { input: 30, output: 180 },
};

export function estimateCostCents(modelName, usage) {
  const pricing = OPENAI_PRICING_USD_PER_M[modelName];
  if (!pricing) return null;

  const inputTokens = Number(usage.input_tokens ?? 0);
  const cachedInputTokens = Number(usage.input_tokens_details?.cached_tokens ?? 0);
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const cachedInputUsd =
    cachedInputTokens > 0 && pricing.cachedInput != null
      ? (cachedInputTokens / 1_000_000) * pricing.cachedInput
      : (cachedInputTokens / 1_000_000) * pricing.input;
  const usd =
    (billableInputTokens / 1_000_000) * pricing.input +
    cachedInputUsd +
    (outputTokens / 1_000_000) * pricing.output;

  return Number((usd * 100).toFixed(4));
}

export function summarizeUsage(items) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costCents: 0,
  };

  for (const item of items) {
    const current = item.usage ?? {};
    usage.inputTokens += Number(current.input_tokens ?? 0);
    usage.cachedInputTokens += Number(current.input_tokens_details?.cached_tokens ?? 0);
    usage.outputTokens += Number(current.output_tokens ?? 0);
    usage.reasoningTokens += Number(current.output_tokens_details?.reasoning_tokens ?? 0);
    usage.totalTokens += Number(current.total_tokens ?? 0);
    usage.costCents += Number(item.costCents ?? 0);
  }

  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    costCents: Number(usage.costCents.toFixed(4)),
  };
}
