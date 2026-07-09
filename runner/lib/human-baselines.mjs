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
export const HUMAN_BASELINE_PROTOCOL_VERSION = 'timed_expert_baseline_v2';

const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isIsoTimestamp = (v) => isNonEmptyString(v) && !Number.isNaN(Date.parse(v));
const isSha256 = (v) => isNonEmptyString(v) && SHA_256_RE.test(v);

/**
 * Validate a single human-baseline record. Returns an error string, or null.
 * A record: { world_id, human_id, elapsed_seconds, success }.
 */
export function validateBaselineRecord(record, { requireProtocol = false } = {}) {
  if (!record || typeof record !== 'object') return 'record must be an object';
  if (!isNonEmptyString(record.world_id))
    return 'world_id is required';
  if (!isNonEmptyString(record.human_id))
    return 'human_id is required';
  if (!isFiniteNum(record.elapsed_seconds) || record.elapsed_seconds < 0)
    return 'elapsed_seconds must be a non-negative number';
  if (typeof record.success !== 'boolean') return 'success must be a boolean';

  if (record.protocol_version || requireProtocol) {
    if (record.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION)
      return `protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}`;
    if (!isIsoTimestamp(record.started_at)) return 'started_at must be an ISO timestamp';
    if (!isIsoTimestamp(record.completed_at)) return 'completed_at must be an ISO timestamp';
    if (Date.parse(record.completed_at) < Date.parse(record.started_at))
      return 'completed_at must be after started_at';
    if (!isSha256(record.artifact_hash)) return 'artifact_hash must be sha256:<64 hex>';
    if (!isSha256(record.receipt_hash)) return 'receipt_hash must be sha256:<64 hex>';
    if (!isSha256(record.operator_profile_hash))
      return 'operator_profile_hash must be sha256:<64 hex>';
    if (!isIsoTimestamp(record.blind_review_recorded_at))
      return 'blind_review_recorded_at must be an ISO timestamp';
    if (!isIsoTimestamp(record.grader_verdict_revealed_at))
      return 'grader_verdict_revealed_at must be an ISO timestamp';
    if (Date.parse(record.grader_verdict_revealed_at) < Date.parse(record.blind_review_recorded_at))
      return 'grader_verdict_revealed_at must be after blind_review_recorded_at';
  }
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
  const protocolErrors = baselines
    .map((r, i) => ({ i, err: validateBaselineRecord(r, { requireProtocol: true }) }))
    .filter((entry) => entry.err);
  const byWorld = new Map();
  for (const r of baselines) {
    let w = byWorld.get(r.world_id);
    if (!w) {
      w = { times: [], successes: 0, samples: 0, humans: new Set(), protocolErrors: 0 };
      byWorld.set(r.world_id, w);
    }
    w.times.push(r.elapsed_seconds);
    w.samples += 1;
    w.humans.add(r.human_id);
    if (validateBaselineRecord(r, { requireProtocol: true })) w.protocolErrors += 1;
    if (r.success) w.successes += 1;
  }

  const per_world = [...byWorld.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([world_id, w]) => ({
      world_id,
      samples: w.samples,
      humans: w.humans.size,
      median_seconds: median(w.times),
      success_rate: w.samples > 0 ? Number((w.successes / w.samples).toFixed(4)) : 0,
      protocol_eligible: w.humans.size >= HUMAN_BASELINE_MIN_N && w.protocolErrors === 0,
    }));

  const allTimes = baselines.map((r) => r.elapsed_seconds);
  const successes = baselines.filter((r) => r.success).length;

  const worldsWithMinimumHumans = per_world.filter((w) => w.protocol_eligible).length;
  const protocolEligible = baselines.length > 0 && protocolErrors.length === 0;

  return {
    protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
    humans: humans.size,
    samples: baselines.length,
    median_seconds: median(allTimes),
    success_rate:
      baselines.length > 0 ? Number((successes / baselines.length).toFixed(4)) : 0,
    per_world,
    worlds_with_minimum_humans: worldsWithMinimumHumans,
    protocol_eligible: protocolEligible,
    protocol_error_count: protocolErrors.length,
    // The published headline gate: corpus-splits.json humanBaselineMinimumN.
    headline_eligible: protocolEligible && humans.size >= HUMAN_BASELINE_MIN_N,
    minimum_humans: HUMAN_BASELINE_MIN_N,
  };
}

export function validateHumanBaselineCoverage({
  baselines,
  holdoutWorlds,
  minimumHumans = HUMAN_BASELINE_MIN_N,
} = {}) {
  const summary = summarizeHumanBaselines(baselines ?? []);
  const expectedWorldIds = (holdoutWorlds ?? [])
    .map((world) => (typeof world === 'string' ? world : world?.worldId))
    .filter(isNonEmptyString);
  const perWorld = new Map(summary.per_world.map((world) => [world.world_id, world]));
  const missingWorlds = [];
  const underBaselineWorlds = [];

  for (const worldId of expectedWorldIds) {
    const world = perWorld.get(worldId);
    if (!world) {
      missingWorlds.push(worldId);
      continue;
    }
    if (world.humans < minimumHumans || !world.protocol_eligible) {
      underBaselineWorlds.push({
        world_id: worldId,
        humans: world.humans,
        samples: world.samples,
        protocol_eligible: world.protocol_eligible,
      });
    }
  }

  return {
    ok:
      expectedWorldIds.length > 0 &&
      summary.protocol_eligible &&
      missingWorlds.length === 0 &&
      underBaselineWorlds.length === 0,
    target_worlds: expectedWorldIds.length,
    worlds_with_minimum_humans: summary.per_world.filter(
      (world) => expectedWorldIds.includes(world.world_id) && world.protocol_eligible
    ).length,
    missing_worlds: missingWorlds,
    under_baseline_worlds: underBaselineWorlds,
    summary: {
      ...summary,
      headline_eligible:
        summary.headline_eligible &&
        expectedWorldIds.length > 0 &&
        missingWorlds.length === 0 &&
        underBaselineWorlds.length === 0,
    },
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
