// Human-baseline instrument (the headline's last buildable piece).
//
// corpus-splits.json requires the private_holdout headline to carry a
// human_baseline_summary with at least humanBaselineMinimumN (3) timed human
// baselines. This is the harness support that INCORPORATES those baselines:
// validate the records, summarize per-world and overall, and gate
// headline-eligibility on the >=3 distinct-humans policy.
//
// The COMPUTATION is complete and tested here; the actual baseline DATA needs
// real humans timing themselves on the worlds — the one input no run produces.

export const HUMAN_BASELINE_MIN_N = 3;

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a single human-baseline record. Returns an error string, or null.
 * A record: { world_id, human_id, elapsed_seconds, success }.
 */
export function validateBaselineRecord(record) {
  if (!record || typeof record !== 'object') return 'record must be an object';
  if (typeof record.world_id !== 'string' || !record.world_id.trim())
    return 'world_id is required';
  if (typeof record.human_id !== 'string' || !record.human_id.trim())
    return 'human_id is required';
  if (!isFiniteNum(record.elapsed_seconds) || record.elapsed_seconds < 0)
    return 'elapsed_seconds must be a non-negative number';
  if (typeof record.success !== 'boolean') return 'success must be a boolean';
  return null;
}

/**
 * Summarize human baselines into the published human_baseline_summary, gating
 * headline-eligibility on >= HUMAN_BASELINE_MIN_N distinct humans. Throws on an
 * invalid record (fail loud — a malformed baseline must never silently inflate
 * a headline).
 */
export function summarizeHumanBaselines(baselines) {
  if (!Array.isArray(baselines)) {
    throw new Error('human baselines must be an array');
  }
  baselines.forEach((r, i) => {
    const err = validateBaselineRecord(r);
    if (err) throw new Error(`human baseline[${i}]: ${err}`);
  });

  const humans = new Set(baselines.map((r) => r.human_id));
  const byWorld = new Map();
  for (const r of baselines) {
    let w = byWorld.get(r.world_id);
    if (!w) {
      w = { times: [], successes: 0, samples: 0 };
      byWorld.set(r.world_id, w);
    }
    w.times.push(r.elapsed_seconds);
    w.samples += 1;
    if (r.success) w.successes += 1;
  }

  const per_world = [...byWorld.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([world_id, w]) => ({
      world_id,
      samples: w.samples,
      median_seconds: median(w.times),
      success_rate: w.samples > 0 ? Number((w.successes / w.samples).toFixed(4)) : 0,
    }));

  const allTimes = baselines.map((r) => r.elapsed_seconds);
  const successes = baselines.filter((r) => r.success).length;

  return {
    humans: humans.size,
    samples: baselines.length,
    median_seconds: median(allTimes),
    success_rate:
      baselines.length > 0 ? Number((successes / baselines.length).toFixed(4)) : 0,
    per_world,
    // The published headline gate: corpus-splits.json humanBaselineMinimumN.
    headline_eligible: humans.size >= HUMAN_BASELINE_MIN_N,
    minimum_humans: HUMAN_BASELINE_MIN_N,
  };
}

/**
 * Attach a human_baseline_summary to a report and downgrade headline-eligibility
 * if the baselines don't meet the policy minimum. Pure — returns a new object.
 */
export function withHumanBaselines(report, baselines) {
  const summary = summarizeHumanBaselines(baselines ?? []);
  const corpus = report.corpus ?? {};
  return {
    ...report,
    human_baseline_summary: summary,
    corpus: {
      ...corpus,
      // headline requires BOTH a holdout split AND the human-baseline minimum.
      headlineEligible: Boolean(corpus.headlineEligible) && summary.headline_eligible,
    },
  };
}
