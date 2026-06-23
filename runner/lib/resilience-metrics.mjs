// Resilience metrics — the OrgX-native wedge.
//
// A model endpoint can answer. A control plane should RECOVER, stay inside a
// declared budget, and admit uncertainty instead of confabulating. These are
// scored from injected-failure runs (see the resilience worlds in v0.3).

// recovery_score = recovered_failures / injected_failures
// injections: [{ failureClass, injected: true, recovered: boolean }]
export function recoveryScore(injections = []) {
  const injected = injections.filter((i) => i.injected);
  if (!injected.length) return { ratio: null, injected: 0, recovered: 0, note: 'no failures injected' };
  const recovered = injected.filter((i) => i.recovered).length;
  return {
    ratio: Number((recovered / injected.length).toFixed(4)),
    injected: injected.length,
    recovered,
    byClass: summarizeByClass(injected),
  };
}

function summarizeByClass(injected) {
  const map = {};
  for (const i of injected) {
    const k = i.failureClass ?? 'unknown';
    map[k] ??= { injected: 0, recovered: 0 };
    map[k].injected += 1;
    if (i.recovered) map[k].recovered += 1;
  }
  return map;
}

// budget_adherence = runs_within_declared_budget / total_runs
// A trust benchmark must prove a system does not "win" by silently overspending.
// run: { budget: {dollars?,tokens?,calls?,wallSeconds?}, consumed: {...} }
export function withinBudget(run) {
  const b = run.budget ?? {};
  const c = run.consumed ?? {};
  for (const key of ['dollars', 'tokens', 'calls', 'wallSeconds']) {
    if (b[key] != null && Number(c[key] ?? 0) > Number(b[key])) return false;
  }
  return true;
}

export function budgetAdherence(runs = []) {
  if (!runs.length) return { ratio: null, within: 0, total: 0 };
  const within = runs.filter(withinBudget).length;
  return { ratio: Number((within / runs.length).toFixed(4)), within, total: runs.length };
}

// uncertainty_honesty = correctly-abstained / should-have-abstained
// Rewards saying "not enough evidence" when the ground truth is unanswerable,
// protecting the benchmark from optimizing for confident wrong answers.
// cases: [{ answerable: boolean, abstained: boolean }]
export function uncertaintyHonesty(cases = []) {
  const shouldAbstain = cases.filter((c) => c.answerable === false);
  if (!shouldAbstain.length) return { ratio: null, shouldAbstain: 0, correct: 0 };
  const correct = shouldAbstain.filter((c) => c.abstained).length;
  // Penalize false abstentions on answerable cases.
  const falseAbstain = cases.filter((c) => c.answerable === true && c.abstained).length;
  return {
    ratio: Number((correct / shouldAbstain.length).toFixed(4)),
    shouldAbstain: shouldAbstain.length,
    correct,
    falseAbstentions: falseAbstain,
  };
}
