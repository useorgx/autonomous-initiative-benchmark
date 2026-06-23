// Accurate, manifest-derived claim strings.
//
// The original buildClaims() hardcoded "OpenAI Responses API" and "independent
// OpenAI judge calls" regardless of the actual generation provider or judge
// panel. That propagated a false attribution to 10+ bundles whose judges were
// in fact three DeepSeek models via OpenRouter. Claims must be DERIVED from the
// manifest, never hand-maintained.

function providerLabel(provider) {
  const map = {
    openai: 'OpenAI Responses API',
    openrouter: 'OpenRouter',
    deepseek: 'DeepSeek API',
    orgx: 'the OrgX agent surface',
    fugu: 'Sakana Fugu (OpenAI-compatible endpoint)',
  };
  return map[provider] ?? provider ?? 'an unspecified provider';
}

function judgePanelLabel(judgePanel = []) {
  if (!judgePanel.length) return 'no independent judges';
  const models = [...new Set(judgePanel.map((j) => j.model).filter(Boolean))];
  const providers = [...new Set(judgePanel.map((j) => j.provider).filter(Boolean))];
  const provText = providers.map(providerLabel).join(' + ');
  return `${models.length} independent judge${models.length === 1 ? '' : 's'} (${models.join(', ')}) via ${provText}`;
}

// generationMethod: { provider, model, surface? }
// judgePanel: [{ provider, model, reasoningEffort }]
// costComparable: boolean (telemetry fully measured both surfaces)
export function buildClaims({ generationMethod = {}, judgePanel = [], hasJudges, costComparable }) {
  const genProvider = providerLabel(generationMethod.provider);
  const genModel = generationMethod.model ?? 'an unspecified model';
  const claims = [`Generation: ${genModel} via ${genProvider}.`];

  if (hasJudges) {
    claims.push(`Artifacts were scored by ${judgePanelLabel(judgePanel)} that did not generate the artifact.`);
    claims.push('Public quality scores use median criterion scores and flag material judge disagreement for human review.');
  } else {
    claims.push('Scores are self-reported by the model against public acceptance criteria (smoke-test signal only).');
  }

  if (costComparable === false) {
    claims.push('COST NOT COMPARABLE: this bundle has incomplete resource telemetry; cost-per-task is suppressed and must not be compared against fully-measured bundles.');
  }
  return claims;
}
