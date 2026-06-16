// Corpus-split awareness for the runner (wires worlds/corpus-splits.json policy).
//
// Headline numbers may come ONLY from the private_holdout split (hidden state,
// off-repo validators). The in-repo instrumented worlds are public/contamination-
// visible — useful for transparency, smoke testing, and demonstrating the
// validator architecture, but NOT headline-eligible. Without this, a run over
// the public worlds could be misread as a headline score; this tags every run
// with its split and an explicit headline-eligibility flag.
//
// A world declares its split via `world.split`; untagged worlds default to
// 'public_validation' (the safe, honest default for anything sitting in-repo).

export const HEADLINE_SPLIT = 'private_holdout';

export function worldSplit(world) {
  return world?.split ?? 'public_validation';
}

export function filterWorldsBySplit(worlds, split) {
  if (!split) return worlds;
  return worlds.filter((w) => worldSplit(w) === split);
}

export function computeCorpusEligibility(worlds) {
  const splits = [...new Set(worlds.map(worldSplit))].sort();
  const headlineEligible =
    splits.length > 0 && splits.every((s) => s === HEADLINE_SPLIT);
  return {
    splits,
    headlineEligible,
    note: headlineEligible
      ? `All worlds are ${HEADLINE_SPLIT} — headline-eligible per corpus-splits.json.`
      : 'Includes public / contamination-visible worlds — NOT headline-eligible; for harness transparency and validation only (corpus-splits.json policy).',
  };
}
