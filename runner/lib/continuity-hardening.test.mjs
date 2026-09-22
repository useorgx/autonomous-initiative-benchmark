import test from "node:test";
import assert from "node:assert/strict";
import { SpendGuard, createProviderCaller } from "./continuity-provider.mjs";
import {
  buildContinuityPlan,
  summarizeContinuity,
} from "./continuity-runner.mjs";
import { auditCallAccounting } from "./continuity-replay.mjs";
const model = {
  id: "p/m",
  canonical_slug: "p/m",
  pricing: { prompt: "0.000001", completion: "0.000001" },
};
test("cost overrun preserves both settled guards and original failure", async () => {
  const guard = new SpendGuard(1),
    episodeGuard = new SpendGuard(1),
    events = [];
  const call = createProviderCaller({
    model,
    key: "test",
    guard,
    episodeGuard,
    emit: (e) => events.push(e),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "p/m",
        usage: { cost: 2, prompt_tokens: 1, completion_tokens: 1 },
        choices: [{ message: { content: "done" } }],
      }),
    }),
  });
  await assert.rejects(
    () => call({ model: "p/m", max_tokens: 10 }),
    /exceeded conservative budget/
  );
  assert.equal(guard.snapshot().observed_usd, 2);
  assert.equal(episodeGuard.snapshot().observed_usd, 2);
  assert.equal(events.at(-1).status, "failed");
  assert.equal(events.at(-1).cost_usd, 2);
});
test("pending reservations cannot be cost complete", () => {
  const g = new SpendGuard(1);
  g.reserve({ max_tokens: 10 }, model);
  assert.equal(g.snapshot().cost_complete, false);
});
test("negative prices cannot increase remaining budget", () => {
  assert.throws(() =>
    new SpendGuard(1).reserve(
      { max_tokens: 10 },
      { ...model, pricing: { prompt: -1, completion: 0 } }
    )
  );
});
test("episode cap must be finite positive", () => {
  for (const episodeBudgetUsd of [null, 0, -1, NaN])
    assert.throws(() => buildContinuityPlan({ episodeBudgetUsd }));
});
test("summary rejects relabelled planned identities", () => {
  const plan = buildContinuityPlan();
  const rows = plan.episodes.map((j) => ({
    ...j,
    status: "blocked",
    accepted: false,
    calls: [],
  }));
  rows[0].arm = "fake";
  assert.throws(() => summarizeContinuity(plan, rows));
});
test("summary rejects forged acceptance without evaluator history", () => {
  const plan = buildContinuityPlan();
  const rows = plan.episodes.map((j) => ({
    ...j,
    status: "scored",
    accepted: true,
    calls: [],
  }));
  assert.throws(() => summarizeContinuity(plan, rows));
});
test("summary retains unresolved call costs", () => {
  const plan = buildContinuityPlan();
  const rows = plan.episodes.map((j) => ({
    ...j,
    status: "blocked",
    accepted: false,
    calls: [],
  }));
  rows[0].calls = [{ status: "started", provider_call_index: 1 }];
  const report = summarizeContinuity(plan, rows);
  assert.equal(
    report.groups.find(
      (g) => g.model_id === rows[0].model_id && g.arm === rows[0].arm
    ).cost_complete,
    false
  );
});
test("orphan success cannot be reclassified as pre-call denial", () => {
  assert.equal(
    auditCallAccounting([
      { status: "succeeded", provider_call_index: 1, cost_usd: 1 },
    ]).ok,
    false
  );
});
test("denied reservation has its own call identity and measured zero dispatch cost", async () => {
  const guard = new SpendGuard(0.01),
    episodeGuard = new SpendGuard(1),
    events = [];
  const call = createProviderCaller({
    model,
    key: "test",
    guard,
    episodeGuard,
    emit: (e) => events.push(e),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "p/m",
        usage: { cost: 0.009, prompt_tokens: 1, completion_tokens: 1 },
        choices: [{ message: { content: "done" } }],
      }),
    }),
  });
  await call({ max_tokens: 10 });
  await assert.rejects(() => call({ max_tokens: 10 }), /cap/);
  assert.equal(events.at(-1).status, "rejected");
  assert.equal(events.at(-1).provider_call_index, 2);
  const accounting = auditCallAccounting(events);
  assert.equal(accounting.ok, true);
  assert.equal(accounting.actual_calls, 1);
  assert.equal(accounting.observed_cost_usd, 0.009);
  assert.equal(accounting.cost_complete, true);
});
test("exhausted credit preflight makes no completion call", async () => {
  const { checkContinuityCredit } = await import("./continuity-preflight.mjs");
  let calls = 0;
  const result = await checkContinuityCredit({
    key: "test",
    fetchImpl: async (url) => {
      calls++;
      assert.ok(url.endsWith("/credits"));
      return {
        ok: true,
        json: async () => ({ data: { total_credits: 10, total_usage: 10.1 } }),
      };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.model_calls_made, 0);
});

test("terminal provider errors halt subsequent dispatch even when billed cost is zero", async () => {
  const guard = new SpendGuard(1),
    events = [];
  let dispatched = 0;
  const call = createProviderCaller({
    model,
    key: "test",
    guard,
    episodeGuard: new SpendGuard(1),
    emit: (e) => events.push(e),
    fetchImpl: async () => {
      dispatched++;
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 400 },
          usage: { cost: 0, prompt_tokens: 0, completion_tokens: 0 },
        }),
      };
    },
  });
  await assert.rejects(() => call({ model: model.id, max_tokens: 10 }), /400/);
  await assert.rejects(() => call({ model: model.id, max_tokens: 10 }));
  assert.equal(dispatched, 1);
  assert.equal(events.at(-1).status, "rejected");
});
