import test from "node:test";
import assert from "node:assert/strict";
import {
  createContinuityWorld,
  solveVisibleWorld,
} from "../../worlds/continuity/environment.mjs";
import { buildContinuityPlan } from "./continuity-runner.mjs";
import {
  replayContinuityEpisode,
  auditCallAccounting,
  auditContinuityLedger,
} from "./continuity-replay.mjs";
const plan = buildContinuityPlan({
  models: ["test/model"],
  arms: ["persistent_agent"],
  seeds: [11],
});
function episode(job) {
  const evaluation = solveVisibleWorld(createContinuityWorld(job));
  return { ...job, status: "scored", accepted: true, evaluation, calls: [] };
}
test("independent action replay reproduces every family and twin", () => {
  for (const job of plan.episodes)
    assert.equal(replayContinuityEpisode(job, episode(job)).ok, true);
});
test("forged acceptance and evaluator fields are rejected", () => {
  const j = plan.episodes[0],
    e = episode(j);
  e.evaluation.accepted_obligations = 999;
  assert.equal(replayContinuityEpisode(j, e).ok, false);
});
test("altered actions are rejected even with self-updated history digest", () => {
  const j = plan.episodes[0],
    e = episode(j);
  e.evaluation.history.find((x) => x.type === "tool_called").args.id = "bogus";
  assert.equal(replayContinuityEpisode(j, e).ok, false);
});
test("unmatched started call cannot become a free call", () => {
  const a = auditCallAccounting([
    { status: "started", provider_call_index: 1 },
  ]);
  assert.equal(a.ok, false);
  assert.equal(a.cost_complete, false);
  assert.equal(a.unresolved_calls, 1);
});
test("pre-call blocked event is distinct from measured provider spend", () => {
  const a = auditCallAccounting([
    { status: "failed", provider_call_index: 0, cost_usd: null },
  ]);
  assert.equal(a.actual_calls, 0);
  assert.equal(a.precall_failures, 1);
  assert.equal(a.cost_complete, false);
});
test("incomplete or mismatched jobs cannot produce a valid report", () => {
  const episodes = plan.episodes.map(episode);
  episodes[0].status = "pending";
  const ledger = {
    release_id: plan.release_id,
    plan_digest: plan.plan_digest,
    episodes,
    budget: { observed_usd: 0 },
  };
  assert.equal(auditContinuityLedger(plan, ledger).ok, false);
});
test("complete fixture ledger replays and cost reconciles", () => {
  const ledger = {
    release_id: plan.release_id,
    plan_digest: plan.plan_digest,
    episodes: plan.episodes.map(episode),
    budget: { observed_usd: 0 },
  };
  const a = auditContinuityLedger(plan, ledger);
  assert.equal(a.ok, true);
  assert.equal(a.replayed, 6);
  assert.equal(a.provenance_verified, false);
});

test("exhausting the world action budget leaves a replayable failure", () => {
  const job = plan.episodes[0],
    world = createContinuityWorld(job);
  assert.throws(() => {
    for (let i = 0; i < 121; i++)
      world.act({ tool: "read", args: { id: "policy" } });
  }, /action budget/);
  const evaluation = world.evaluate();
  assert.equal(
    evaluation.actor_calls,
    evaluation.history.filter((e) => e.type === "tool_called").length
  );
  assert.equal(
    replayContinuityEpisode(job, {
      ...job,
      status: "lost",
      accepted: false,
      evaluation,
    }).ok,
    true
  );
});
