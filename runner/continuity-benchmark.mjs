#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createContinuityWorld,
  solveVisibleWorld,
  FAMILIES,
} from "../worlds/continuity/environment.mjs";
import {
  buildContinuityPlan,
  runContinuityEpisode,
  summarizeContinuity,
  DEFAULT_MODELS,
  ARMS,
  TOOLS_NATIVE,
} from "./lib/continuity-runner.mjs";
import { checkContinuityCredit } from "./lib/continuity-preflight.mjs";
import { auditContinuityLedger } from "./lib/continuity-replay.mjs";
import {
  resolveModelManifest,
  createProviderCaller,
  SpendGuard,
} from "./lib/continuity-provider.mjs";
import { digest } from "./lib/evidence-integrity.mjs";
const [command = "self-test", ...argv] = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) throw new Error("Expected --option");
  options[argv[i].slice(2)] = argv[++i];
}
const out = path.resolve(options.out ?? "artifacts/continuity");
async function sourceDigest() {
  const files = [
    "continuity-benchmark.mjs",
    "lib/continuity-runner.mjs",
    "lib/continuity-provider.mjs",
    "lib/continuity-preflight.mjs",
    "lib/continuity-paired.mjs",
    "lib/continuity-replay.mjs",
    "lib/evidence-integrity.mjs",
  ];
  return digest(
    await Promise.all(
      files.map(async (file) => [
        file,
        await readFile(new URL(file, import.meta.url), "utf8"),
      ])
    )
  );
}
async function json(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, file);
}
if (command === "self-test") {
  const results = [];
  for (const family of FAMILIES)
    for (const seed of [11, 29, 47, 83])
      for (const variant of [0, 1]) {
        const valid = solveVisibleWorld(
          createContinuityWorld({ family, seed, variant })
        );
        const noop = createContinuityWorld({ family, seed, variant });
        noop.act({ tool: "checkpoint" });
        noop.act({ tool: "finish" });
        results.push({
          family,
          seed,
          variant,
          valid: valid.accepted,
          noop: noop.evaluate().accepted,
        });
      }
  const passed = results.every((x) => x.valid && !x.noop);
  await json(out, {
    schema: "orgx.continuity-selftest/v1",
    kind: "deterministic_reference_not_model_result",
    passed,
    cases: results.length,
    results,
  });
  if (!passed) process.exitCode = 1;
} else if (command === "plan") {
  await json(
    out,
    buildContinuityPlan({
      sourceCommit: process.env.GITHUB_SHA ?? "uncommitted",
    })
  );
} else if (command === "freeze") {
  await mkdir(out, { recursive: true });
  const models = (options.models ?? DEFAULT_MODELS.join(",")).split(","),
    seeds = (options.seeds ?? "11,29,47,83").split(",").map(Number);
  const manifest = await resolveModelManifest(models);
  const plan = buildContinuityPlan({
    models,
    seeds,
    arms:
      options["component-arm"] === "true"
        ? [...ARMS, "orgx_runtime_component"]
        : ARMS,
    sourceCommit:
      process.env.BENCHMARK_COMMIT ?? process.env.GITHUB_SHA ?? "uncommitted",
    budgetUsd: Number(options["max-usd"] ?? 40),
    episodeBudgetUsd: Number(options["episode-max-usd"] ?? 1.5),
  });
  plan.model_manifest_digest = digest(manifest);
  plan.tool_schema_digest = digest(TOOLS_NATIVE);
  plan.runner_source_digest = await sourceDigest();
  plan.generator_digest = digest(
    await readFile(
      new URL("../worlds/continuity/environment.mjs", import.meta.url),
      "utf8"
    )
  );
  delete plan.plan_digest;
  plan.plan_digest = digest(plan);
  await json(path.join(out, "models.json"), manifest);
  await json(path.join(out, "plan.json"), plan);
  console.log(
    JSON.stringify({
      frozen: true,
      plan_digest: plan.plan_digest,
      models: manifest.models.map((m) => ({
        id: m.id,
        canonical_slug: m.canonical_slug,
      })),
      episodes: plan.episode_count,
      limits: plan.limits,
    })
  );
} else if (command === "run") {
  await mkdir(out, { recursive: true });
  const models = (options.models ?? DEFAULT_MODELS.join(",")).split(",");
  const seeds = (options.seeds ?? "11,29,47,83").split(",").map(Number);
  let adapter = null;
  if (options.adapter)
    adapter = await import(pathToFileURL(path.resolve(options.adapter)).href);
  const arms = adapter ? [...ARMS, "orgx_runtime_component"] : ARMS;
  let plan = buildContinuityPlan({
    models,
    seeds,
    arms,
    sourceCommit:
      process.env.BENCHMARK_COMMIT ?? process.env.GITHUB_SHA ?? "uncommitted",
    budgetUsd: Number(options["max-usd"] ?? 40),
    episodeBudgetUsd: Number(options["episode-max-usd"] ?? 1.5),
  });
  const adapters = new Map();
  let manifest = null,
    preflightError = null;
  try {
    if (options.frozen) {
      plan = JSON.parse(
        await readFile(path.join(options.frozen, "plan.json"), "utf8")
      );
      manifest = JSON.parse(
        await readFile(path.join(options.frozen, "models.json"), "utf8")
      );
      const { plan_digest, ...unsigned } = plan;
      if (
        (await sourceDigest()) !== plan.runner_source_digest ||
        digest(unsigned) !== plan_digest ||
        digest(manifest) !== plan.model_manifest_digest ||
        digest(TOOLS_NATIVE) !== plan.tool_schema_digest ||
        digest(
          await readFile(
            new URL("../worlds/continuity/environment.mjs", import.meta.url),
            "utf8"
          )
        ) !== plan.generator_digest
      )
        throw new Error("Frozen input integrity mismatch");
      if (
        process.env.BENCHMARK_COMMIT &&
        plan.source_commit !== process.env.BENCHMARK_COMMIT
      )
        throw new Error("Frozen source identity mismatch");
    } else manifest = await resolveModelManifest(models);
    if (
      plan.arms.includes("orgx_runtime_component") &&
      !adapter?.createTurnAdapter
    )
      throw new Error(
        "Frozen component arm requires its runtime adapter before dispatch"
      );
    for (const job of plan.episodes.filter(
      (job) => job.arm === "orgx_runtime_component"
    )) {
      const turnAdapter = adapter.createTurnAdapter({
        job,
        model: manifest.models.find((model) => model.id === job.model_id),
        limits: plan.limits,
      });
      if (typeof turnAdapter !== "function")
        throw new Error("Runtime adapter must return a callable turn adapter");
      adapters.set(job.episode_id, turnAdapter);
    }
    await json(path.join(out, "models.json"), manifest);
    const credit = await checkContinuityCredit({
      key: process.env.OPENROUTER_API_KEY,
      requiredUsd: plan.limits.max_usd,
    });
    await json(path.join(out, "credit-preflight.json"), credit);
    if (!credit.ok) throw new Error(credit.reason);
  } catch (e) {
    preflightError = e.message;
  }
  await json(path.join(out, "plan.json"), plan);
  const guard = new SpendGuard(plan.limits.max_usd),
    results = new Map();
  const fullReason =
    "Full production runtime parity, isolated workspace execution and external acceptance evidence not established. No prompt-wrapper substitution.";
  for (const job of plan.episodes)
    results.set(job.episode_id, {
      ...job,
      status: "pending",
      accepted: false,
      error: null,
      calls: [],
    });
  let writeQueue = Promise.resolve();
  function flush() {
    const snapshot = structuredClone({
      release_id: plan.release_id,
      plan_digest: plan.plan_digest,
      episodes: [...results.values()],
      budget: guard.snapshot(),
    });
    writeQueue = writeQueue.then(() =>
      json(path.join(out, "ledger.json"), snapshot)
    );
    return writeQueue;
  }
  await flush();
  let shuttingDown = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      shuttingDown = true;
    });
  // Sequential calls inside an episode; bounded interleaving across independent worlds.
  const queue = [...plan.episodes];
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      let error =
        preflightError ?? (job.arm === "orgx_full" ? fullReason : null);
      if (shuttingDown) error = "Execution interrupted before start";
      if (!process.env.OPENROUTER_API_KEY)
        error = "OPENROUTER_API_KEY unavailable";
      if (error) {
        results.set(job.episode_id, {
          ...job,
          status: "blocked",
          accepted: false,
          error,
          calls: [],
        });
        continue;
      }
      const model = manifest.models.find((m) => m.id === job.model_id);
      const calls = [];
      const episodeGuard = new SpendGuard(plan.limits.episode_max_usd);
      const call = createProviderCaller({
        model,
        key: process.env.OPENROUTER_API_KEY,
        guard,
        episodeGuard,
        emit: async (event) => {
          calls.push(event);
          results.set(job.episode_id, {
            ...results.get(job.episode_id),
            status: "running",
            accepted: false,
            calls: [...calls],
          });
          await flush();
        },
      });
      const turnAdapter = adapters.get(job.episode_id) ?? null;
      const result = await runContinuityEpisode({
        job,
        call,
        limits: plan.limits,
        turnAdapter,
        shouldStop: () => shuttingDown,
        onTurn: async (progress) => {
          results.set(job.episode_id, {
            ...job,
            status: "running",
            accepted: false,
            calls: [...calls],
            progress,
          });
          await flush();
        },
      });
      results.set(job.episode_id, {
        ...result,
        calls,
        budget: episodeGuard.snapshot(),
        evidence_scope:
          job.arm === "orgx_runtime_component"
            ? "production_runtime_component_NOT_full_OrgX"
            : "generic_agent_control",
      });
      await flush();
      console.log(
        JSON.stringify({
          episode: job.episode_id,
          status: result.status,
          accepted: result.accepted,
          cost: episodeGuard.snapshot().observed_usd,
        })
      );
    }
  }
  // Serialize ledger writes across workers to avoid rename races.
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  await flush();
  const report = summarizeContinuity(plan, [...results.values()]);
  report.budget = guard.snapshot();
  report.preflight_error = preflightError;
  report.result_digest = digest([...results.values()]);
  await json(path.join(out, "report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (preflightError) process.exitCode = 1;
  if (shuttingDown) process.exitCode = 130;
} else if (command === "report") {
  const plan = JSON.parse(await readFile(options.plan, "utf8")),
    ledger = JSON.parse(await readFile(options.ledger, "utf8"));
  const audit = auditContinuityLedger(plan, ledger);
  await json(out, {
    ...summarizeContinuity(plan, ledger.episodes),
    integrity_audit: audit,
    budget: ledger.budget,
  });
  if (!audit.ok) process.exitCode = 1;
} else throw new Error(`Unknown command ${command}`);
