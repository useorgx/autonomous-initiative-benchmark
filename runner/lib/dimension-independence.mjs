export const DEFAULT_INDEPENDENCE_DIMENSIONS = [
  'outcome',
  'safety',
  'trust',
  'judgment',
  'evidence',
  'coordination',
  'efficiency',
];

export function buildDimensionIndependenceReport(episodes, {
  dimensions = DEFAULT_INDEPENDENCE_DIMENSIONS,
  maxAbsCorrelation = 0.85,
  minPairedObservations = 8,
} = {}) {
  const rows = normalizeRows(episodes, dimensions);
  const matrix = {};
  const pairStats = [];
  const warnings = [];

  for (const [leftIndex, left] of dimensions.entries()) {
    matrix[left] = {};
    for (const [rightIndex, right] of dimensions.entries()) {
      const paired = rows
        .map((row) => [row[left], row[right]])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      const value = left === right ? 1 : pearson(paired.map(([a]) => a), paired.map(([, b]) => b));
      matrix[left][right] = Number.isFinite(value) ? round(value) : null;
      if (leftIndex >= rightIndex) continue;
      if (paired.length < minPairedObservations) {
        warnings.push(`${left}/${right} has only ${paired.length} paired observations.`);
      }
      if (!Number.isFinite(value)) {
        warnings.push(`${left}/${right} has insufficient variance for correlation.`);
        pairStats.push({ left, right, n: paired.length, correlation: null, absCorrelation: null, status: 'insufficient_variance' });
        continue;
      }
      const absCorrelation = Math.abs(value);
      pairStats.push({
        left,
        right,
        n: paired.length,
        correlation: round(value),
        absCorrelation: round(absCorrelation),
        status: absCorrelation > maxAbsCorrelation ? 'coupled' : 'independent_enough',
      });
    }
  }

  const coupledPairs = pairStats.filter((pair) => pair.status === 'coupled');
  const observed = pairStats
    .map((pair) => pair.absCorrelation)
    .filter(Number.isFinite);
  const maxObserved = observed.length ? Math.max(...observed) : null;

  return {
    ok: coupledPairs.length === 0,
    dimensions,
    rowCount: rows.length,
    maxAbsCorrelation,
    maxObservedAbsCorrelation: maxObserved == null ? null : round(maxObserved),
    matrix,
    pairStats,
    coupledPairs,
    warnings,
  };
}

export function assertDimensionIndependence(episodes, options) {
  const report = buildDimensionIndependenceReport(episodes, options);
  if (!report.ok) {
    const pairs = report.coupledPairs
      .map((pair) => `${pair.left}/${pair.right}=${pair.correlation}`)
      .join(', ');
    throw new Error(`dimension independence failed: ${pairs}`);
  }
  return report;
}

export function makeSyntheticDimensionAuditEpisodes({ cycles = 4, coupled = false } = {}) {
  const dims = DEFAULT_INDEPENDENCE_DIMENSIONS;
  const episodes = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let mask = 0; mask < 2 ** dims.length; mask += 1) {
      const dimensions = {};
      dims.forEach((dimension, index) => {
        dimensions[dimension] = (mask >> index) & 1;
      });
      if (coupled) dimensions.trust = dimensions.outcome;
      episodes.push({
        episodeId: `synthetic-${cycle}-${mask}`,
        agentClass: syntheticAgentClass(mask),
        dimensions,
      });
    }
  }
  return episodes;
}

function normalizeRows(episodes, dimensions) {
  return (episodes ?? []).map((episode) => {
    const source = episode.dimensions ?? episode;
    return Object.fromEntries(dimensions.map((dimension) => [dimension, Number(source?.[dimension])]));
  });
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length === 0) return NaN;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let numerator = 0;
  let xSquares = 0;
  let ySquares = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    xSquares += dx * dx;
    ySquares += dy * dy;
  }
  const denominator = Math.sqrt(xSquares * ySquares);
  return denominator === 0 ? NaN : numerator / denominator;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function syntheticAgentClass(mask) {
  if (mask === 0) return 'degenerate_noop';
  if ((mask & 0b11) === 0b11) return 'lucky_executor';
  if ((mask & 0b101) === 0b101) return 'unsafe_solver';
  return 'random_probe';
}

function round(value) {
  return Number(Number(value).toFixed(4));
}
