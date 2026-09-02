const finite = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function mean(values) {
  const usable = values.filter(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );
  return usable.length
    ? usable.reduce((sum, value) => sum + value, 0) / usable.length
    : null;
}

export function round(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function isCompleteEpisodeResource(episode) {
  return (
    episode.weg?.resourceTelemetryComplete !== false &&
    finite(episode.weg?.totalTokens) &&
    finite(episode.weg?.costCents)
  );
}

export function summarizeEpisodeResources(episodes) {
  const tokenValues = episodes
    .map((episode) => episode.weg?.totalTokens)
    .filter(finite);
  const costValues = episodes
    .map((episode) => episode.weg?.costCents)
    .filter(finite);
  const completeEpisodes = episodes.filter(isCompleteEpisodeResource);
  const completeTokenValues = completeEpisodes.map(
    (episode) => episode.weg.totalTokens
  );
  const completeCostValues = completeEpisodes.map(
    (episode) => episode.weg.costCents
  );
  const complete =
    episodes.length > 0 && completeEpisodes.length === episodes.length;

  // When one episode has incomplete telemetry, its observed usage is only a
  // lower bound on the final usage. Divide the sum of every known accrued value
  // by the full planned denominator so this remains a genuine lower bound. Do
  // not silently average only the successful/complete rows.
  const knownMeanTokenLowerBound = episodes.length
    ? tokenValues.reduce((sum, value) => sum + value, 0) / episodes.length
    : null;
  const knownMeanCostLowerBoundCents = episodes.length
    ? costValues.reduce((sum, value) => sum + value, 0) / episodes.length
    : null;

  return {
    complete,
    completeEpisodes: completeEpisodes.length,
    meanTokens: complete ? mean(tokenValues) : null,
    meanCostCents: complete ? mean(costValues) : null,
    knownMeanTokenLowerBound,
    knownMeanCostLowerBoundCents,
    // Diagnostic only. These means condition on complete telemetry and must not
    // be used as the all-episode cost/usage estimate.
    meanTokensAcrossCompleteEpisodes: mean(completeTokenValues),
    meanCostCentsAcrossCompleteEpisodes: mean(completeCostValues),
    tokenValues,
    costValues,
    completeTokenValues,
    completeCostValues,
  };
}

export function summarizeDimension(episodes, dimension) {
  const values = episodes
    .map((episode) => episode.dimensions?.[dimension])
    .filter(
      (value) => typeof value === 'number' && Number.isFinite(value)
    );
  return {
    value: mean(values),
    values,
    measuredEpisodes: values.length,
  };
}

export function classifyObservedHeadroom(rawStats) {
  if (!rawStats || rawStats.n === 0) return 'raw_unobserved';
  return rawStats.passAtK === 1
    ? 'raw_sample_perfect'
    : 'raw_headroom_observed';
}
