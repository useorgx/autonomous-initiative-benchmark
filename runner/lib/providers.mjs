// Provider registry for the benchmark harness.
//
// The original harness hardcoded the OpenAI Responses API for both generation
// and judging, which meant OpenAI artifacts were always scored by OpenAI
// judges. This registry adds OpenAI-compatible chat-completions providers so
// a cross-provider judge panel (e.g. DeepSeek via OpenRouter) can verify
// results produced by a different vendor's models.
export const PROVIDERS = {
  openai: {
    api: 'responses',
    url: 'https://api.openai.com/v1/responses',
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    api: 'chat',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    // OpenRouter reports the billed cost on each response, so cost tracking
    // does not depend on a static pricing table.
    usageCostField: 'cost',
  },
  deepseek: {
    api: 'chat',
    url: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
  },
  // Sakana Fugu — a learned multi-agent orchestrator behind one
  // OpenAI-compatible endpoint. Verified 2026-06-22 from console.sakana.ai.
  // Run it as a black-box orchestration arm (the 3-arm demo). Note: `fugu`
  // only accepts reasoning effort high|xhigh|max — NOT low — so the engine must
  // use this provider-level reasoningEffort instead of its 'low' default.
  // Cost is not exposed as usage.cost, so dollar cost is reported `unknown`;
  // the envelope is tokens + latency (predictability, not price).
  fugu: {
    api: 'chat',
    url: 'https://api.sakana.ai/v1/chat/completions',
    envKey: 'SAKANA_API_KEY',
    reasoningEffort: 'high',
    models: ['fugu', 'fugu-ultra'],
  },
};

export function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown provider "${name}". Known providers: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

export function requireProviderKey(name) {
  const provider = getProvider(name);
  if (!process.env[provider.envKey]) {
    throw new Error(`${provider.envKey} is required for provider "${name}".`);
  }
  return process.env[provider.envKey];
}

// Chat-completions usage shape -> Responses API usage shape so the existing
// bundle accounting (summarizeUsage) keeps working across providers.
export function normalizeChatUsage(usage = {}) {
  return {
    input_tokens: Number(usage.prompt_tokens ?? 0),
    input_tokens_details: {
      cached_tokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    },
    output_tokens: Number(usage.completion_tokens ?? 0),
    output_tokens_details: {
      reasoning_tokens: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
    },
    total_tokens: Number(usage.total_tokens ?? 0),
  };
}

// Prefer the provider-reported billed cost (OpenRouter returns USD on every
// response); fall back to null so static pricing tables can take over.
export function chatUsageCostCents(usage = {}) {
  const cost = Number(usage.cost);
  return Number.isFinite(cost) && cost > 0 ? Number((cost * 100).toFixed(4)) : null;
}
