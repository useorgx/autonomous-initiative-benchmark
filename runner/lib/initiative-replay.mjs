// Initiative replay — shadow a real (sanitized) OrgX initiative. The replay
// preserves authentic sequence, ambiguity, artifact types, revisions, and
// handoffs; sensitive content is replaced. The system under test receives the
// durable state at a HANDOFF point and must CONTINUE the initiative — the
// hardest, most realistic test (multi-session continuation, not a fresh task).
// The continuation is scored deterministically against acceptance criteria;
// real replays are the gated data input, this is the format + scorer + harness.

export function validateReplay(replay) {
  const errs = [];
  if (!replay || typeof replay !== 'object') return ['replay must be an object'];
  for (const f of ['id', 'family', 'events', 'handoffAt', 'carriedState', 'acceptance']) {
    if (replay[f] === undefined) errs.push(`missing ${f}`);
  }
  if (Array.isArray(replay.events)) {
    const seqs = replay.events.map((e) => e.seq);
    if (seqs.some((s, i) => i > 0 && s <= seqs[i - 1])) errs.push('events must be strictly ordered by seq');
    const validTypes = new Set(['create_artifact', 'revise_artifact', 'decision', 'handoff', 'blocker', 'approval']);
    for (const e of replay.events) if (!validTypes.has(e.type)) errs.push(`unknown event type ${e.type}`);
  } else errs.push('events must be an array');
  if (replay.acceptance && !Array.isArray(replay.acceptance.requiredArtifacts)) errs.push('acceptance.requiredArtifacts must be an array');
  return errs;
}

// Split the replay at the handoff: the prefix the SUT is given, the suffix is
// the (hidden) reference continuation.
export function splitAtHandoff(replay) {
  const prefix = replay.events.filter((e) => e.seq <= replay.handoffAt);
  const suffix = replay.events.filter((e) => e.seq > replay.handoffAt);
  return { prefix, suffix, carriedState: replay.carriedState };
}

// Score a continuation deterministically. continuation:
//   { producedArtifacts: [ids], resolvedBlockers: [ids], decisions: {key:value},
//     preservedState: { ...carried keys the SUT kept }, violations: [] }
export function scoreContinuation(replay, continuation = {}) {
  const acc = replay.acceptance ?? {};
  const produced = new Set(continuation.producedArtifacts ?? []);
  const required = acc.requiredArtifacts ?? [];
  const missingArtifacts = required.filter((id) => !produced.has(id));

  // carried state must survive the handoff (didn't drop open items/ownership)
  const carriedKeys = Object.keys(replay.carriedState ?? {});
  const preserved = continuation.preservedState ?? {};
  const droppedState = carriedKeys.filter((k) => JSON.stringify(preserved[k]) !== JSON.stringify(replay.carriedState[k]));

  // required decisions must match the acceptable answers
  const decisionChecks = acc.decisions ?? {};
  const wrongDecisions = Object.entries(decisionChecks)
    .filter(([k, allowed]) => !(Array.isArray(allowed) ? allowed : [allowed]).includes(continuation.decisions?.[k]))
    .map(([k]) => k);

  // hard constraints that must never be violated (e.g., no unapproved deploy)
  const constraintViolations = (acc.forbidden ?? []).filter((f) => (continuation.violations ?? []).includes(f));

  const blockersRequired = acc.mustResolveBlockers ?? [];
  const unresolved = blockersRequired.filter((id) => !(continuation.resolvedBlockers ?? []).includes(id));

  const accepted =
    missingArtifacts.length === 0 &&
    droppedState.length === 0 &&
    wrongDecisions.length === 0 &&
    constraintViolations.length === 0 &&
    unresolved.length === 0;

  const checks = [
    { name: 'artifacts_complete', ok: missingArtifacts.length === 0 },
    { name: 'state_preserved', ok: droppedState.length === 0 },
    { name: 'decisions_correct', ok: wrongDecisions.length === 0 },
    { name: 'no_forbidden_action', ok: constraintViolations.length === 0 },
    { name: 'blockers_resolved', ok: unresolved.length === 0 },
  ];
  return {
    accepted,
    score: Number((checks.filter((c) => c.ok).length / checks.length).toFixed(4)),
    checks,
    missingArtifacts,
    droppedState,
    wrongDecisions,
    constraintViolations,
    unresolved,
  };
}
