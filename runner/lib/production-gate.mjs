// Production gate — the framework every domain's acceptance contract plugs into.
//
// Real rollout is not one check; it is many quantified gates of different
// severity. A check is { id, dimension, severity: 'blocker'|'major'|'minor',
// run: (artifact, ctx) => boolean | {pass, value, detail} }. An artifact SHIPS
// only if EVERY blocker passes AND the weighted score over all checks >= the
// ship threshold. This is what raises the bar 100x: a strong single-pass model
// can ace one check but rarely clears 15-20 production gates at once.

const WEIGHT = { blocker: 5, major: 3, minor: 1 };

function normalize(result) {
  if (typeof result === 'boolean') return { pass: result, value: result ? 1 : 0 };
  const pass = result?.pass === true || result?.value === 1;
  return { pass: Boolean(result?.pass ?? pass), value: Number(result?.value ?? (pass ? 1 : 0)), detail: result?.detail };
}

export function runGate(checks, artifact, ctx = {}, { shipThreshold = 0.9 } = {}) {
  const results = checks.map((c) => {
    let r;
    try {
      r = normalize(c.run(artifact, ctx));
    } catch (e) {
      r = { pass: false, value: 0, detail: `check threw: ${e?.message ?? e}` };
    }
    return { id: c.id, dimension: c.dimension, severity: c.severity, weight: WEIGHT[c.severity] ?? 1, ...r };
  });

  const blockers = results.filter((r) => r.severity === 'blocker');
  const blockersFailed = blockers.filter((r) => !r.pass).map((r) => r.id);
  const totalWeight = results.reduce((s, r) => s + r.weight, 0) || 1;
  const earned = results.reduce((s, r) => s + (r.pass ? r.weight : 0), 0);
  const weightedScore = Number((earned / totalWeight).toFixed(4));

  const shipped = blockersFailed.length === 0 && weightedScore >= shipThreshold;
  return {
    shipped,
    weightedScore,
    shipThreshold,
    blockerPass: blockersFailed.length === 0,
    blockersFailed,
    failed: results.filter((r) => !r.pass).map((r) => ({ id: r.id, dimension: r.dimension, severity: r.severity, detail: r.detail })),
    byDimension: summarizeByDimension(results),
    checks: results,
    // NAU candidate score: full ship = 1; blockers ok but below threshold = the
    // partial weighted score (looks-shippable, not actually); blocker fail caps low.
    score: shipped ? 1 : blockersFailed.length === 0 ? Number((weightedScore * 0.6).toFixed(4)) : Number((weightedScore * 0.3).toFixed(4)),
  };
}

function summarizeByDimension(results) {
  const map = {};
  for (const r of results) {
    map[r.dimension] ??= { total: 0, passed: 0 };
    map[r.dimension].total += 1;
    if (r.pass) map[r.dimension].passed += 1;
  }
  return map;
}

// Helper to declare a check terse-ly.
export function check(id, dimension, severity, run) {
  return { id, dimension, severity, run };
}
