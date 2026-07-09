const DEFAULT_Z_95 = 1.959963984540054;

export function wilsonInterval(successes, total, z = DEFAULT_Z_95) {
  const n = Number(total);
  const x = Number(successes);
  if (!Number.isFinite(n) || n <= 0) return { low: null, high: null };
  const p = Math.min(1, Math.max(0, x / n));
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { low: round(Math.max(0, center - margin), 4), high: round(Math.min(1, center + margin), 4) };
}

export function passPower(passRate, k) {
  const rate = Math.min(1, Math.max(0, Number(passRate)));
  return round(rate ** Number(k), 4);
}

export function passPowerCurve(passRate, ks = [1, 4, 8, 16, 32]) {
  return Object.fromEntries(ks.map((k) => [`k${k}`, passPower(passRate, k)]));
}

export function bcaBootstrapMeanInterval(values, options = {}) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length === 0) return { low: null, high: null };
  if (clean.length === 1) {
    const value = round(clean[0], 4);
    return { low: value, high: value };
  }

  const iterations = Math.max(100, Number(options.iterations ?? 1000));
  const alpha = (1 - Number(options.confidence ?? 0.95)) / 2;
  const observed = mean(clean);
  const rng = seededRandom(Number(options.seed ?? 13_371));
  const boot = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = [];
    for (let j = 0; j < clean.length; j += 1) {
      sample.push(clean[Math.floor(rng() * clean.length)]);
    }
    boot.push(mean(sample));
  }
  boot.sort((a, b) => a - b);

  const less = boot.filter((value) => value < observed).length;
  const z0 = inverseNormalCdf(clamp01((less + 0.5) / (boot.length + 1)));
  const jackknife = clean.map((_, index) =>
    mean(clean.filter((__, currentIndex) => currentIndex !== index))
  );
  const jackMean = mean(jackknife);
  const numerator = jackknife.reduce((sum, estimate) => sum + (jackMean - estimate) ** 3, 0);
  const denominator =
    6 *
    Math.pow(
      jackknife.reduce((sum, estimate) => sum + (jackMean - estimate) ** 2, 0),
      1.5
    );
  const acceleration = denominator === 0 ? 0 : numerator / denominator;
  const lowAlpha = adjustedAlpha(alpha, z0, acceleration);
  const highAlpha = adjustedAlpha(1 - alpha, z0, acceleration);

  return {
    low: round(quantileSorted(boot, lowAlpha), 4),
    high: round(quantileSorted(boot, highAlpha), 4),
  };
}

export function pairedBinaryComparison(baseline, candidate) {
  const pairs = [];
  const candidateByKey = new Map(candidate.map((item) => [pairKey(item), item]));
  for (const base of baseline) {
    const other = candidateByKey.get(pairKey(base));
    if (other) pairs.push([Boolean(base.pass), Boolean(other.pass)]);
  }
  const candidateWins = pairs.filter(([base, other]) => !base && other).length;
  const baselineWins = pairs.filter(([base, other]) => base && !other).length;
  const ties = pairs.length - candidateWins - baselineWins;
  return {
    pairedCount: pairs.length,
    candidateWins,
    baselineWins,
    ties,
    netWins: candidateWins - baselineWins,
    candidateWinRate: pairs.length ? round((candidateWins + ties * 0.5) / pairs.length, 4) : null,
  };
}

export function bernoulliCoverageSimulation(options = {}) {
  const trials = Math.max(1, Number(options.trials ?? 1000));
  const n = Math.max(1, Number(options.n ?? 20));
  const p = Math.min(1, Math.max(0, Number(options.p ?? 0.5)));
  const rng = seededRandom(Number(options.seed ?? 42));
  let covered = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    let successes = 0;
    for (let i = 0; i < n; i += 1) {
      if (rng() < p) successes += 1;
    }
    const interval = wilsonInterval(successes, n);
    if (interval.low <= p && p <= interval.high) covered += 1;
  }
  return { trials, n, p, coverage: round(covered / trials, 4) };
}

function pairKey(item) {
  const seed = item.seedIndex ?? String(item.episodeId ?? '').match(/-e(\d+)$/)?.[1] ?? '';
  return `${item.worldId}:${seed}`;
}

function adjustedAlpha(alpha, z0, acceleration) {
  const zAlpha = inverseNormalCdf(alpha);
  const numerator = z0 + zAlpha;
  const denominator = 1 - acceleration * numerator;
  if (denominator === 0) return alpha;
  return clamp01(normalCdf(z0 + numerator / denominator));
}

function quantileSorted(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = clamp01(q) * (sorted.length - 1);
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * abs);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-abs * abs);
  return sign * y;
}

function inverseNormalCdf(p) {
  const x = clamp01(p);
  if (x <= 0) return Number.NEGATIVE_INFINITY;
  if (x >= 1) return Number.POSITIVE_INFINITY;

  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (x < plow) {
    const q = Math.sqrt(-2 * Math.log(x));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (x > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - x));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = x - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function clamp01(value) {
  return Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, Number(value)));
}

function round(n, digits = 3) {
  return Number(Number(n).toFixed(digits));
}
