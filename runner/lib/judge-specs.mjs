import { PROVIDERS } from './providers.mjs';

// Judge panel pinned to currently-available OpenAI GA models. The prior panel
// referenced gpt-5.4-* placeholders that no longer resolve against the API, so
// `--judge-preset public` failed every judge call. A cheap/low, mid/medium, and
// strong/high reasoning judge keeps the panel diverse without overpaying.
export const DEFAULT_PUBLIC_JUDGE_PANEL = [
  { provider: 'openai', model: 'gpt-5-nano', reasoningEffort: 'low' },
  { provider: 'openai', model: 'gpt-5-mini', reasoningEffort: 'medium' },
  { provider: 'openai', model: 'gpt-5.1', reasoningEffort: 'high' },
];

// Cross-provider verification panel: DeepSeek judges served through
// OpenRouter, so artifacts generated on OpenAI or Anthropic models are scored
// by a vendor that did not produce them.
export const DEEPSEEK_JUDGE_PANEL = [
  { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash', reasoningEffort: 'low' },
  { provider: 'openrouter', model: 'deepseek/deepseek-v3.2', reasoningEffort: 'medium' },
  { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro', reasoningEffort: 'high' },
];

export const JUDGE_PRESETS = {
  public: DEFAULT_PUBLIC_JUDGE_PANEL,
  default: DEFAULT_PUBLIC_JUDGE_PANEL,
  deepseek: DEEPSEEK_JUDGE_PANEL,
};

// Spec entries are `[provider:]model[:reasoningEffort]`. The model segment may
// contain slashes (OpenRouter ids like deepseek/deepseek-v4-pro), so the
// provider segment is only recognized when it matches a registered provider.
export function parseJudgeSpecs(value) {
  if (!value || value === 'none') return [];
  if (JUDGE_PRESETS[value]) return JUDGE_PRESETS[value];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const segments = entry.split(':');
      const provider = PROVIDERS[segments[0]] ? segments.shift() : 'openai';
      const [model, reasoningEffort = 'medium'] = segments;
      if (!model) throw new Error(`Judge spec "${entry}" is missing a model.`);
      return { provider, model, reasoningEffort };
    });
}

export function judgeSpecLabel(spec) {
  return `${spec.provider ?? 'openai'}:${spec.model}:${spec.reasoningEffort}`;
}

export function judgeId(spec, index) {
  return `${judgeSpecLabel(spec)}:j${index + 1}`;
}
