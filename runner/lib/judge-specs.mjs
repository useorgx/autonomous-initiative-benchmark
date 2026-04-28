export const DEFAULT_PUBLIC_JUDGE_PANEL = [
  { model: 'gpt-5.4-nano', reasoningEffort: 'low' },
  { model: 'gpt-5.4-mini', reasoningEffort: 'medium' },
  { model: 'gpt-5.4', reasoningEffort: 'high' },
];

export function parseJudgeSpecs(value) {
  if (!value || value === 'none') return [];
  if (value === 'public' || value === 'default') return DEFAULT_PUBLIC_JUDGE_PANEL;

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [model, reasoningEffort = 'medium'] = entry.split(':');
      return { model, reasoningEffort };
    });
}

export function judgeId(spec, index) {
  return `${spec.model}:${spec.reasoningEffort}:j${index + 1}`;
}
