// Normalized Artifact Utility — the keystone of work-product-in-use evaluation.
//
// A downstream-consumer test otherwise measures the consumer, not the artifact.
// Run the SAME blind consumer in three conditions and normalize:
//   NAU = (S_candidate - S_no_artifact) / (S_gold - S_no_artifact)
// 1.0 = the candidate transferred as much capability as an expert-authored gold;
// 0.0 = no better than having no artifact; <0 = the artifact made the consumer
// WORSE (actively harmful work product). This isolates the artifact's value.

export function normalizedArtifactUtility({ noArtifact, candidate, gold }) {
  const none = Number(noArtifact);
  const cand = Number(candidate);
  const g = Number(gold);
  const denom = g - none;
  if (!Number.isFinite(denom) || denom === 0) {
    // gold provides no lift over no-artifact → the task can't discriminate utility.
    return { nau: null, reason: 'gold provides no lift over no-artifact baseline', noArtifact: none, candidate: cand, gold: g };
  }
  const nau = (cand - none) / denom;
  return {
    nau: Number(nau.toFixed(4)),
    noArtifact: none,
    candidate: cand,
    gold: g,
    harmful: nau < 0, // the artifact degraded the consumer below the no-artifact baseline
    matchedGold: nau >= 1,
  };
}

// Aggregate over many instances (mean NAU + the share that were harmful).
export function aggregateUtility(rows) {
  const vals = rows.map((r) => normalizedArtifactUtility(r)).filter((r) => r.nau != null);
  if (!vals.length) return { meanNau: null, n: 0 };
  const mean = vals.reduce((s, r) => s + r.nau, 0) / vals.length;
  return {
    n: vals.length,
    meanNau: Number(mean.toFixed(4)),
    harmfulRate: Number((vals.filter((r) => r.harmful).length / vals.length).toFixed(4)),
    matchedGoldRate: Number((vals.filter((r) => r.matchedGold).length / vals.length).toFixed(4)),
  };
}
