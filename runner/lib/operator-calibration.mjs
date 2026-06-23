// Operator calibration — the METR lesson: automated graders OVERSTATE acceptance
// (on SWE-bench Verified the grader ran +24.2pp above maintainer decisions, and
// ~half of grader-passing patches wouldn't be merged). So the automated grader
// must be calibrated against BLIND, role-qualified human operators before any
// acceptance claim. This is the computation; the human accept/reject decisions
// are the one input no run produces (recorded via record-operator-review.mjs).

// pairs: [{ automated: boolean (grader accepted), human: boolean (operator accepted) }]
export function calibrateGraderVsOperators(pairs = []) {
  const n = pairs.length;
  if (!n) return { n: 0, agreement: null };
  let a = 0; // both accept
  let b = 0; // grader accept, human reject (OVERSTATEMENT)
  let c = 0; // grader reject, human accept (understatement)
  let d = 0; // both reject
  for (const p of pairs) {
    if (p.automated && p.human) a += 1;
    else if (p.automated && !p.human) b += 1;
    else if (!p.automated && p.human) c += 1;
    else d += 1;
  }
  const agreement = (a + d) / n;
  const automatedAccept = (a + b) / n;
  const humanAccept = (a + c) / n;
  // Cohen's kappa (2x2)
  const pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n);
  const kappa = pe === 1 ? 1 : (agreement - pe) / (1 - pe);
  return {
    n,
    agreement: Number(agreement.toFixed(4)),
    automatedAcceptRate: Number(automatedAccept.toFixed(4)),
    humanAcceptRate: Number(humanAccept.toFixed(4)),
    // the METR gap: how many pp the grader overstates acceptance
    overstatementPp: Number(((automatedAccept - humanAccept) * 100).toFixed(2)),
    falseAcceptRate: Number((b / n).toFixed(4)), // grader said yes, human said no
    falseRejectRate: Number((c / n).toFixed(4)),
    cohenKappa: Number(kappa.toFixed(4)),
    // a grader is trustworthy for acceptance claims only at high agreement + low overstatement
    calibrated: agreement >= 0.85 && Math.abs(automatedAccept - humanAccept) <= 0.1,
  };
}

// reviews: [{ accepted, reworkMinutes, clarifications, defects }]
export function operatorMetrics(reviews = []) {
  const n = reviews.length;
  if (!n) return { n: 0 };
  const num = (sel) => reviews.reduce((s, r) => s + Number(sel(r) ?? 0), 0);
  return {
    n,
    firstPassAcceptanceRate: Number((reviews.filter((r) => r.accepted === true).length / n).toFixed(4)),
    meanReworkMinutes: Number((num((r) => r.reworkMinutes) / n).toFixed(2)),
    meanClarifications: Number((num((r) => r.clarifications) / n).toFixed(2)),
    defectEscapeRate: Number((reviews.filter((r) => Number(r.defects ?? 0) > 0).length / n).toFixed(4)),
  };
}

export function validateOperatorReview(r) {
  if (!r || typeof r !== 'object') return 'review must be an object';
  if (typeof r.artifact_id !== 'string' || !r.artifact_id.trim()) return 'artifact_id required';
  if (typeof r.operator_id !== 'string' || !r.operator_id.trim()) return 'operator_id required';
  if (typeof r.accepted !== 'boolean') return 'accepted must be boolean';
  if (r.rework_minutes != null && !(Number.isFinite(r.rework_minutes) && r.rework_minutes >= 0)) return 'rework_minutes must be >= 0';
  return null;
}
