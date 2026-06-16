// Gate v3.0 — verify-on-the-edge (benchmark port).
//
// Mirror of orgx/lib/server/gate/verifyOnTheEdge.ts. The benchmark showed
// reflexive verification (orgx/orgx2) doubled pass rate ONLY in the borderline
// band, and otherwise spent the expensive re-derivation pass on steps the model
// was already reliable on. This policy spends that budget only where it moves
// the needle: verify borderline steps, skip reliable ones (cost) and hopeless
// ones (waste). High-risk/irreversible steps always verify (safety floor).
//
// Pure and deterministic. Kept in sync with the product policy by hand (two
// repos); the shape and thresholds match.

export const DEFAULT_GATE_CONFIG = {
  reliableThreshold: 0.85,
  hopelessThreshold: 0.2,
};

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function classifyBand(input, config = DEFAULT_GATE_CONFIG) {
  const confidence = clamp01(input.confidence);
  const difficulty = clamp01(input.difficulty ?? 0);
  const widen = 0.1 * difficulty;
  const reliable = config.reliableThreshold + widen;
  const hopeless = config.hopelessThreshold - widen;
  if (confidence >= reliable) return 'reliable';
  if (confidence <= hopeless) return 'hopeless';
  return 'borderline';
}

export function decideVerification(input, config = DEFAULT_GATE_CONFIG) {
  const band = classifyBand(input, config);
  if (input.highRisk) {
    return { verify: true, band, reason: 'high-risk: safety floor always verifies' };
  }
  if (band === 'reliable') {
    return { verify: false, band, reason: 'reliable: skip (verifying is pure cost)' };
  }
  if (band === 'hopeless') {
    return { verify: false, band, reason: 'hopeless: skip verify, route to escalation' };
  }
  return { verify: true, band, reason: 'borderline: verify (where verification moves pass rate)' };
}
