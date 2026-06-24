// The product <-> benchmark loop, made mechanical.
//
// PRODUCT -> BENCHMARK: real human overrides of gate decisions become (a) a
// sourced schema delta (loosen a check humans keep overriding; flag a gap the
// gate keeps missing) and (b) new labeled benchmark fixtures (the overridden
// artifacts), so the benchmark learns from real acceptance.
//
// BENCHMARK -> PRODUCT: a benchmark-discovered failure mode becomes a new
// production gate in the schema.
//
// The LLM's role is DERIVATION, not adjudication: it proposes the deterministic
// check/threshold from the override evidence (the `proposedCheck`/`proposedRetune`
// it hands in); the runtime gate stays pure code. This keeps the loop's judgement
// explicit and grounded, not a black-box score.

import { evolveSchema } from './acceptance-schema.mjs';

// Agreement between the gate and blind human labels — the loop's north-star.
// labeled: [{ artifact, humanAccept: boolean }]; gateFn(artifact) -> shippedBool.
export function agreement(gateFn, labeled) {
  const n = labeled.length || 1;
  let agree = 0;
  let falseAccept = 0; // gate ships, human rejects
  let falseReject = 0; // gate rejects, human accepts
  for (const { artifact, humanAccept } of labeled) {
    const shipped = gateFn(artifact);
    if (shipped === humanAccept) agree += 1;
    else if (shipped && !humanAccept) falseAccept += 1;
    else falseReject += 1;
  }
  return {
    n: labeled.length,
    agreement: Number((agree / n).toFixed(4)),
    falseAcceptRate: Number((falseAccept / n).toFixed(4)),
    falseRejectRate: Number((falseReject / n).toFixed(4)),
  };
}

// PRODUCT -> BENCHMARK. overrides: [{ artifactId, artifact, gateShipped, humanAccept,
//   attributedCheckId?, derived? }]. `derived` carries the LLM-proposed delta
//   (e.g. {kind:'demote',toSeverity:'advisory'} or {kind:'retune',threshold,run}
//   or {kind:'add_check',check}) so the mechanism applies an explicit change.
export function reconcileFromOverrides(schema, overrides, { minSupport = 2 } = {}) {
  const decisions = [];
  const mintedCases = [];
  let evolved = schema;

  // group false-rejects by the check humans keep overriding
  const byCheck = {};
  for (const o of overrides) {
    if (!o.gateShipped && o.humanAccept && o.attributedCheckId) {
      (byCheck[o.attributedCheckId] ??= []).push(o);
    }
    // every override becomes a labeled benchmark fixture
    mintedCases.push({ id: o.artifactId, artifact: o.artifact, label: o.humanAccept ? 'human-accept' : 'human-reject', source: 'production-override' });
  }

  for (const [checkId, group] of Object.entries(byCheck)) {
    if (group.length < minSupport) {
      decisions.push({ checkId, action: 'hold', reason: `only ${group.length} overrides (< ${minSupport}); not enough signal` });
      continue;
    }
    const d = group[0].derived ?? { kind: 'demote', toSeverity: 'advisory' };
    const reason = `${group.length} blind human accepts overrode ${checkId}; ${d.kind}`;
    if (d.kind === 'demote') evolved = evolveSchema(evolved, { type: 'demote', id: checkId, toSeverity: d.toSeverity }, { source: 'production-override', reason });
    else if (d.kind === 'retune') evolved = evolveSchema(evolved, { type: 'retune', id: checkId, threshold: d.threshold, run: d.run }, { source: 'production-override', reason });
    else if (d.kind === 'remove') evolved = evolveSchema(evolved, { type: 'remove', id: checkId }, { source: 'production-override', reason });
    decisions.push({ checkId, action: d.kind, reason });
  }

  // false-accepts (gate shipped, human rejected) are GAPS: the gate missed a
  // production requirement. Surface them for derivation (they don't auto-add a
  // check without a proposed deterministic check — that is the LLM-derivation step).
  const gaps = overrides.filter((o) => o.gateShipped && !o.humanAccept);
  for (const g of gaps) {
    if (g.derived?.kind === 'add_check') {
      evolved = evolveSchema(evolved, { type: 'add_check', check: g.derived.check }, { source: 'production-override', reason: `gate shipped an artifact a human rejected: ${g.note ?? ''}` });
      decisions.push({ artifactId: g.artifactId, action: 'add_check', checkId: g.derived.check.id });
    } else {
      decisions.push({ artifactId: g.artifactId, action: 'gap-flagged', reason: 'gate over-accepted; needs a derived deterministic check' });
    }
  }

  return { schema: evolved, mintedCases, decisions };
}

// BENCHMARK -> PRODUCT. finding: { failureClass, proposedCheck, evidence }.
export function reconcileFromBenchmark(schema, finding) {
  const evolved = evolveSchema(schema, { type: 'add_check', check: finding.proposedCheck }, { source: 'benchmark-finding', reason: `${finding.failureClass}: ${finding.evidence ?? ''}` });
  return { schema: evolved, decision: { action: 'add_check', checkId: finding.proposedCheck.id, failureClass: finding.failureClass } };
}
