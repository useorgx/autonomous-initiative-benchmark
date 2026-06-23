// Calculation replay — a DETERMINISTIC groundedness check (FActScore-for-numbers)
// for the free-text the worlds currently collect but never grade (derivation,
// rationale). It catches the "correct scalar + fabricated reasoning" loophole:
// every number cited in the explanation must trace to a value the agent actually
// observed via tools or could legitimately derive. A fabricated intermediate
// (a number nobody saw) is an evidence failure, scored without any LLM judge.

// Extract numeric tokens, tolerating $, commas, %, and decimals.
export function extractNumbers(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const re = /-?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const cleaned = m[0].replace(/[$,%\s]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// supportedValues = the set of numbers the agent legitimately observed (tool
// outputs) plus legitimate derivations (the true intermediates/answer). A cited
// number is supported iff it matches a supported value within tolerance.
export function replayClaims(text, supportedValues, { tolerance = 0, ignore = [] } = {}) {
  const cited = extractNumbers(text).filter((n) => !ignore.includes(n));
  const supp = (supportedValues ?? []).map(Number).filter(Number.isFinite);
  const results = cited.map((n) => ({
    value: n,
    supported: supp.some((s) => Math.abs(s - n) <= tolerance),
  }));
  const supportedList = results.filter((r) => r.supported).map((r) => r.value);
  const fabricated = results.filter((r) => !r.supported).map((r) => r.value);
  return {
    claimsTotal: cited.length,
    supported: supportedList.length,
    supportedValues: supportedList,
    fabricated: fabricated.length,
    fabricatedValues: fabricated,
    // support rate; an empty explanation scores 0 (no grounded reasoning shown),
    // because a derivation was required and not provided.
    supportRate: cited.length ? Number((supportedList.length / cited.length).toFixed(4)) : 0,
  };
}

// Evidence dimension (0..1): 1.0 = every cited number is grounded; an explanation
// with any fabricated number is penalized. Empty/missing explanation = 0.
export function evidenceScore(text, supportedValues, opts) {
  const r = replayClaims(text, supportedValues, opts);
  return { score: r.supportRate, ...r };
}
