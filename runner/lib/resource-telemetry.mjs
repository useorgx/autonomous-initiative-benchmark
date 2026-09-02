const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function mean(values) {
  const usable = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

export function round(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

export function summarizeEpisodeResources(episodes) {
  const tokenValues = episodes.map((episode) => episode.weg?.totalTokens).filter(finite);
  const costValues = episodes.map((episode) => episode.weg?.costCents).filter(finite);
  const complete = episodes.length > 0 && episodes.every((episode) =>
    episode.weg?.resourceTelemetryComplete !== false && finite(episode.weg?.totalTokens) && finite(episode.weg?.costCents));
  return {
    complete,
    completeEpisodes: episodes.filter((episode) =>
      episode.weg?.resourceTelemetryComplete !== false && finite(episode.weg?.totalTokens) && finite(episode.weg?.costCents)).length,
    meanTokens: complete ? mean(tokenValues) : null,
    meanCostCents: complete ? mean(costValues) : null,
    knownMeanTokenLowerBound: mean(tokenValues),
    knownMeanCostLowerBoundCents: mean(costValues),
    tokenValues,
    costValues,
  };
}

export function summarizeDimension(episodes, dimension) {
  const values = episodes.map((episode) => episode.dimensions?.[dimension])
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  return { value: mean(values), values, measuredEpisodes: values.length };
}

export function classifyObservedHeadroom(rawStats) {
  if (!rawStats || rawStats.n === 0) return 'raw_unobserved';
  return rawStats.passAtK === 1 ? 'raw_sample_perfect' : 'raw_headroom_observed';
}
