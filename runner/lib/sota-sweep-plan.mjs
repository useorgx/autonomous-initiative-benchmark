import {
  RELEASE_MIN_EPISODES_PER_CELL,
  RELEASE_MIN_FRONTIER_MODELS,
  RELEASE_MIN_K,
  REQUIRED_RELEASE_ARMS,
  REQUIRED_RELEASE_METRICS,
} from './sota-release.mjs';
import { HUMAN_BASELINE_MIN_N } from './human-baselines.mjs';

export function buildSotaSweepPlan({ releaseManifest, registry, includeJobs = true } = {}) {
  const errors = [];
  const warnings = [];
  const sweep = releaseManifest?.frontierSweep ?? {};
  const holdout = registry?.splits?.private_holdout ?? {};
  const holdoutWorlds = Array.isArray(holdout.worlds) ? holdout.worlds : [];
  const targetWorldCount = Number(holdout.targetWorldCount ?? 20);
  const frontierModels = Array.isArray(sweep.frontierModels) ? sweep.frontierModels : [];
  const arms = Array.isArray(sweep.arms) ? sweep.arms : [];
  const metrics = Array.isArray(sweep.metrics) ? sweep.metrics : [];
  const modelArms = arms.filter((arm) => arm !== 'timed_human');
  const seedsPerCell = Number(sweep.minEpisodesPerCell ?? 0);
  const minK = Number(sweep.minK ?? 0);

  if (!releaseManifest?.releaseId) errors.push('releaseManifest.releaseId is required.');
  if (holdoutWorlds.length < targetWorldCount) {
    errors.push(`private_holdout world count ${holdoutWorlds.length} is below target ${targetWorldCount}.`);
  }
  if (frontierModels.length < RELEASE_MIN_FRONTIER_MODELS) {
    errors.push(`frontierModels must include at least ${RELEASE_MIN_FRONTIER_MODELS} models.`);
  }
  if (seedsPerCell < RELEASE_MIN_EPISODES_PER_CELL) {
    errors.push(`minEpisodesPerCell must be >= ${RELEASE_MIN_EPISODES_PER_CELL}.`);
  }
  if (minK < RELEASE_MIN_K) {
    errors.push(`minK must be >= ${RELEASE_MIN_K}.`);
  }
  for (const arm of REQUIRED_RELEASE_ARMS) {
    if (!arms.includes(arm)) errors.push(`frontierSweep.arms is missing required arm ${arm}.`);
  }
  for (const metric of REQUIRED_RELEASE_METRICS) {
    if (!metrics.includes(metric)) errors.push(`frontierSweep.metrics is missing required metric ${metric}.`);
  }

  const worldIds = [];
  const seenWorldIds = new Set();
  for (const world of holdoutWorlds) {
    const worldId = world?.worldId;
    if (!worldId) {
      errors.push('private_holdout world is missing worldId.');
      continue;
    }
    if (seenWorldIds.has(worldId)) errors.push(`duplicate private_holdout worldId ${worldId}.`);
    seenWorldIds.add(worldId);
    worldIds.push(worldId);
    if (world.status !== 'committed_private') {
      warnings.push(`private_holdout world ${worldId} has status ${world.status ?? '<missing>'}.`);
    }
    if (world.generatorType !== 'parametric') {
      errors.push(`private_holdout world ${worldId} must use generatorType=parametric.`);
    }
  }

  const modelJobs = includeJobs
    ? buildModelJobs({ releaseId: releaseManifest?.releaseId, worldIds, frontierModels, modelArms, seedsPerCell })
    : [];
  const humanBaselineJobs = includeJobs
    ? buildHumanBaselineJobs({ releaseId: releaseManifest?.releaseId, worldIds })
    : [];
  const modelJobCount = worldIds.length * frontierModels.length * modelArms.length * Math.max(0, seedsPerCell);
  const humanBaselineJobCount = worldIds.length * HUMAN_BASELINE_MIN_N;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      releaseId: releaseManifest?.releaseId ?? null,
      split: 'private_holdout',
      worldCount: worldIds.length,
      targetWorldCount,
      frontierModelCount: frontierModels.length,
      armCount: arms.length,
      modelArmCount: modelArms.length,
      seedsPerCell,
      minK,
      modelJobCount,
      humanBaselineJobCount,
      totalExecutionUnits: modelJobCount + humanBaselineJobCount,
    },
    coverage: {
      worlds: worldIds,
      frontierModels,
      arms,
      modelArms,
      humanArm: arms.includes('timed_human') ? 'timed_human' : null,
      metrics,
    },
    ...(includeJobs ? { modelJobs, humanBaselineJobs } : {}),
  };
}

export function compactSweepPlan(plan) {
  return {
    ok: plan.ok,
    errors: plan.errors,
    warnings: plan.warnings,
    summary: plan.summary,
    coverage: plan.coverage,
    samples: {
      firstModelJob: plan.modelJobs?.[0] ?? null,
      lastModelJob: plan.modelJobs?.at?.(-1) ?? (plan.modelJobs?.length ? plan.modelJobs[plan.modelJobs.length - 1] : null),
      firstHumanBaselineJob: plan.humanBaselineJobs?.[0] ?? null,
      lastHumanBaselineJob:
        plan.humanBaselineJobs?.at?.(-1) ??
        (plan.humanBaselineJobs?.length ? plan.humanBaselineJobs[plan.humanBaselineJobs.length - 1] : null),
    },
  };
}

function buildModelJobs({ releaseId, worldIds, frontierModels, modelArms, seedsPerCell }) {
  const jobs = [];
  for (const worldId of worldIds) {
    for (const model of frontierModels) {
      for (const arm of modelArms) {
        for (let seedIndex = 1; seedIndex <= seedsPerCell; seedIndex += 1) {
          jobs.push({
            jobId: jobId({ releaseId, worldId, model, arm, seedIndex }),
            releaseId,
            worldId,
            split: 'private_holdout',
            model,
            arm,
            seedIndex,
          });
        }
      }
    }
  }
  return jobs;
}

function buildHumanBaselineJobs({ releaseId, worldIds }) {
  const jobs = [];
  for (const worldId of worldIds) {
    for (let humanSlot = 1; humanSlot <= HUMAN_BASELINE_MIN_N; humanSlot += 1) {
      jobs.push({
        jobId: jobId({ releaseId, worldId, model: 'timed_human', arm: 'timed_human', seedIndex: humanSlot }),
        releaseId,
        worldId,
        split: 'private_holdout',
        arm: 'timed_human',
        humanSlot,
      });
    }
  }
  return jobs;
}

function jobId({ releaseId, worldId, model, arm, seedIndex }) {
  return [releaseId, worldId, safeId(model), arm, `s${seedIndex}`].filter(Boolean).join('__');
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_');
}
