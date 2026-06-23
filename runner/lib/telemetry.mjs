// Telemetry coverage + null semantics.
//
// The original harness summed missing usage to a literal 0, which is
// indistinguishable from "genuinely free generation". A bundle whose
// generation surface (e.g. the OrgX agent surface running Claude Code) never
// piped token telemetry would therefore publish generation cost = 0 and look
// 30x cheaper than a raw baseline that DID report ~$4 of generation. That makes
// any all-in cost comparison non-equivalent.
//
// Rule: missing usage is `null`/`unknown`, never `0`. A cost comparison is only
// valid when every measured surface (generation + judging) has full coverage.

// An item carries real usage if it has any positive token field. costCents
// alone (provider-billed) also counts as measured.
export function itemIsMeasured(item) {
  const u = item?.usage ?? {};
  const anyTokens =
    Number(u.input_tokens ?? 0) > 0 ||
    Number(u.output_tokens ?? 0) > 0 ||
    Number(u.total_tokens ?? 0) > 0;
  const billed = Number(item?.costCents ?? 0) > 0;
  return Boolean(anyTokens || billed);
}

// coverage ratio over a list of items that were EXPECTED to produce work.
export function coverageOf(items) {
  const total = items.length;
  if (total === 0) return { measured: 0, total: 0, ratio: 1 };
  const measured = items.filter(itemIsMeasured).length;
  return { measured, total, ratio: Number((measured / total).toFixed(4)) };
}

// Given a raw summarizeUsage() result and a coverage assessment, return a
// publication-safe usage block: when nothing was measured the token/cost fields
// become null (unknown), never 0.
export function publicationSafeUsage(summary, coverage) {
  if (coverage.total > 0 && coverage.measured === 0) {
    return {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      costCents: null,
      coverage: coverage.ratio,
      note: 'telemetry missing — represented as unknown, not zero',
    };
  }
  return { ...summary, coverage: coverage.ratio };
}

// A bundle's cost is comparable only when generation AND judging are fully
// measured. Partial coverage forbids any cost-per-task headline.
export function costComparable(generationCoverage, judgingCoverage) {
  return generationCoverage.ratio >= 1 && judgingCoverage.ratio >= 1;
}

// Reissue path: infer the generation-coverage problem from an ALREADY-WRITTEN
// metadata.json (raw per-item usage is gone; we only have the summary). If a
// generation model is named and tasks were produced but the summary shows zero
// generation tokens, telemetry was missing.
export function generationTelemetryMissing(metadata) {
  const gen = metadata?.tokenUsage?.generation ?? {};
  const modelNamed = Boolean(metadata?.generationMethod?.model);
  const producedWork = Number(metadata?.taskCount ?? 0) > 0;
  const zeroTokens =
    Number(gen.totalTokens ?? 0) === 0 &&
    Number(gen.inputTokens ?? 0) === 0 &&
    Number(gen.outputTokens ?? 0) === 0;
  // Only "missing" if it isn't already explicitly nulled.
  const alreadyNulled = gen.totalTokens === null;
  return modelNamed && producedWork && zeroTokens && !alreadyNulled;
}
