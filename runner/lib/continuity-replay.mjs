import { createContinuityWorld } from "../../worlds/continuity/environment.mjs";
import {
  canonicalJson,
  digest,
  exactCoverage,
  isNumber,
} from "./evidence-integrity.mjs";

const TERMINAL = new Set(["scored", "lost", "blocked"]);
const FIELDS = [
  "episode_id",
  "family",
  "seed",
  "variant",
  "world_id",
  "cluster_id",
  "model_id",
  "arm",
];
const EVALUATION_FIELDS = [
  "world_id",
  "planned_obligations",
  "accepted_obligations",
  "accepted",
  "obligations",
  "unauthorized_commits",
  "duplicate_effects",
  "escalations",
  "artifact_writes",
  "actor_calls",
  "history_digest",
];

/** Replays observed business actions, not an agent's claimed score. This is an
 * internal consistency audit. It cannot establish where a transcript originated
 * or independently attest that a remote provider executed the claimed model. */
export function replayContinuityEpisode(job, episode) {
  const errors = [];
  for (const key of FIELDS)
    if (episode?.[key] !== job[key])
      errors.push(`Job identity mismatch: ${key}`);
  if (!TERMINAL.has(episode?.status)) errors.push("Episode is not terminal");
  if (typeof episode?.accepted !== "boolean")
    errors.push("Boolean acceptance required");
  if (episode?.status !== "scored" && episode?.accepted !== false)
    errors.push("Unscored episode cannot count as accepted");
  if (!episode?.evaluation) {
    if (episode?.status === "scored" || episode?.accepted === true)
      errors.push("Scored episode is missing observed state");
    return { ok: !errors.length, errors, replayed: false };
  }
  try {
    const world = createContinuityWorld(job);
    const history = episode.evaluation.history;
    if (!Array.isArray(history) || history.length > 1000)
      throw new Error("Invalid or unbounded action history");
    for (const event of history) {
      if (event.type !== "tool_called") continue;
      // A failed action can still be observed by the environment. Preserve that
      // event and let exact regenerated-history comparison detect any drift.
      try {
        world.act({ tool: event.tool, args: event.args });
      } catch {
        /* Compare below. */
      }
    }
    const actual = world.evaluate();
    if (canonicalJson(actual.history) !== canonicalJson(history))
      errors.push("Observed history is not reproducible from actions");
    for (const key of EVALUATION_FIELDS)
      if (canonicalJson(actual[key]) !== canonicalJson(episode.evaluation[key]))
        errors.push(`Evaluator result differs on replay: ${key}`);
    if (episode.status === "scored" && !world.done)
      errors.push("Scored episode did not finish");
    if (episode.accepted !== (episode.status === "scored" && actual.accepted))
      errors.push("Reported acceptance differs from replay");
    if (
      episode.transcript &&
      digest(episode.transcript) !== episode.transcript_digest
    )
      errors.push("Transcript digest mismatch");
    return { ok: !errors.length, errors, replayed: true, recomputed: actual };
  } catch (error) {
    return { ok: false, errors: [...errors, error.message], replayed: false };
  }
}

export function auditCallAccounting(events) {
  const errors = [],
    warnings = [],
    groups = new Map();
  let observedCost = 0,
    actualCalls = 0,
    unresolvedCalls = 0,
    precallFailures = 0;
  if (!Array.isArray(events))
    return {
      ok: false,
      errors: ["Call event array required"],
      warnings,
      actual_calls: 0,
      observed_cost_usd: 0,
      unresolved_calls: 0,
      cost_complete: false,
    };
  for (const event of events) {
    if (
      !["started", "succeeded", "failed", "rejected"].includes(event.status)
    ) {
      errors.push("Invalid call event status");
      continue;
    }
    const id = event.provider_call_index;
    if (!Number.isSafeInteger(id) || id < 0) {
      errors.push("Invalid call sequence identity");
      continue;
    }
    const rows = groups.get(id) ?? [];
    rows.push(event);
    groups.set(id, rows);
  }
  for (const [id, rows] of groups) {
    const starts = rows.filter((r) => r.status === "started");
    const terminals = rows.filter((r) => r.status !== "started");
    // The initial development runner records denied reservations as failures
    // with no started event. Do not reinterpret them as measured free calls.
    if (
      !starts.length &&
      rows.length === 1 &&
      rows[0].status === "rejected" &&
      rows[0].cost_usd === 0
    ) {
      precallFailures++;
      continue;
    }
    if (!starts.length) {
      if (terminals.some((r) => r.status === "succeeded" || r.cost_usd > 0))
        errors.push(`Call ${id}: terminal provider receipt without start`);
      precallFailures += terminals.length;
      warnings.push(
        `Call slot ${id}: no started receipt, excluded from measured-call totals`
      );
      continue;
    }
    actualCalls += starts.length;
    if (starts.length !== 1 || terminals.length !== 1) {
      errors.push(`Call ${id}: missing or duplicate lifecycle events`);
      unresolvedCalls += starts.length;
      continue;
    }
    const start = starts[0],
      end = terminals[0];
    if (
      start.request_digest !== end.request_digest ||
      start.requested_model !== end.requested_model
    )
      errors.push(`Call ${id}: terminal identity mismatch`);
    if (isNumber(end.cost_usd) && end.cost_usd >= 0)
      observedCost += end.cost_usd;
    else unresolvedCalls++;
    if (
      end.status === "succeeded" &&
      (!Number.isSafeInteger(end.usage?.prompt_tokens) ||
        !Number.isSafeInteger(end.usage?.completion_tokens))
    )
      errors.push(`Call ${id}: success without measured usage`);
  }
  return {
    ok: !errors.length,
    errors,
    warnings,
    actual_calls: actualCalls,
    observed_cost_usd: observedCost,
    unresolved_calls: unresolvedCalls,
    precall_failures: precallFailures,
    cost_complete: !errors.length && !unresolvedCalls && warnings.length === 0,
  };
}

export function auditContinuityLedger(plan, ledger) {
  const errors = [],
    warnings = [],
    rows = [];
  if (
    !plan ||
    !ledger ||
    !Array.isArray(plan.episodes) ||
    !Array.isArray(ledger.episodes)
  )
    return { ok: false, errors: ["Plan and ledger episodes required"] };
  const { plan_digest, ...unsigned } = plan;
  if (
    digest(unsigned) !== plan_digest ||
    ledger.plan_digest !== plan_digest ||
    ledger.release_id !== plan.release_id
  )
    errors.push("Plan or ledger binding mismatch");
  errors.push(
    ...exactCoverage(
      plan.episodes.map((j) => j.episode_id),
      ledger.episodes.map((j) => j.episode_id),
      "execution ledger"
    )
  );
  for (const job of plan.episodes) {
    const episode = ledger.episodes.find(
      (e) => e.episode_id === job.episode_id
    );
    if (!episode) continue;
    const replay = replayContinuityEpisode(job, episode),
      accounting = auditCallAccounting(episode.calls ?? []);
    errors.push(
      ...replay.errors.map((e) => `${job.episode_id}: ${e}`),
      ...accounting.errors.map((e) => `${job.episode_id}: ${e}`)
    );
    warnings.push(...accounting.warnings.map((e) => `${job.episode_id}: ${e}`));
    rows.push({
      ...job,
      status: episode.status,
      accepted: episode.accepted,
      replayed: replay.replayed,
      replay_ok: replay.ok,
      planned_obligations: replay.recomputed?.planned_obligations ?? null,
      accepted_obligations: replay.recomputed?.accepted_obligations ?? null,
      accounting,
    });
  }
  const knownCost = rows.reduce(
    (sum, r) => sum + r.accounting.observed_cost_usd,
    0
  );
  if (
    !isNumber(ledger.budget?.observed_usd) ||
    Math.abs(knownCost - ledger.budget.observed_usd) > 1e-8
  )
    errors.push("Total measured cost disagrees with the run budget ledger");
  return {
    schema: "orgx.continuity-replay-audit/v1",
    ok: !errors.length,
    errors,
    warnings,
    plan_digest,
    ledger_digest: digest(ledger),
    episodes: rows.length,
    replayed: rows.filter((r) => r.replayed).length,
    accepted: rows.filter((r) => r.accepted && r.replay_ok).length,
    observed_cost_usd: knownCost,
    cost_complete: rows.every((r) => r.accounting.cost_complete),
    rows,
    headline_eligible: false,
    provenance_verified: false,
    note: "Deterministic re-execution and accounting consistency, not independent provenance, human leverage or full-product qualification.",
  };
}
