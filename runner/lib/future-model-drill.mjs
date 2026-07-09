import { resolveManifestBoundRunConfig } from './run-manifest.mjs';
import { filterWorldsBySplit } from './corpus-splits.mjs';
import { getProvider } from './providers.mjs';

export function buildFutureModelFireDrillManifests({
  provider = 'openai',
  model = 'gpt-6-fire-drill-stub',
  modelManifestId = `${provider}/${model}`,
  split = 'public_validation',
  k = 2,
  arms = ['raw', 'orgx'],
  createdAt = '2026-07-08T00:00:00.000Z',
} = {}) {
  const evaluationManifestId = `future-model-fire-drill-${provider}-${model}`;
  const modelManifest = {
    id: `models-${evaluationManifestId}`,
    createdAt,
    models: [
      {
        id: modelManifestId,
        provider,
        model,
        pinned: true,
        accessDate: createdAt.slice(0, 10),
        capabilityTags: ['text', 'tool_use', 'future_model_drill'],
        contextWindowTokens: null,
        toolUse: true,
        vision: null,
        pricing: {
          inputUsdPerMTok: null,
          outputUsdPerMTok: null,
          pricingDate: null,
        },
        notes: 'Synthetic future-model row used to prove config-only runner acceptance.',
      },
    ],
  };
  const evaluationManifest = {
    contractVersion: 'orgx-bench-v1.1',
    id: evaluationManifestId,
    date: createdAt.slice(0, 10),
    claim: 'Future frontier models can be introduced through manifests without runner code changes.',
    arms: arms.map((arm) => ({
      id: arm,
      system: arm === 'raw' ? 'single_frontier' : 'adaptive_orgx',
      provider,
      model,
      modelManifestId,
      budget: { tokens: 30000, calls: 12 },
    })),
    tasks: split,
    k,
    metrics: ['pass_at_k', 'pass_pow_k', 'latency', 'budget_adherence'],
    modelManifest,
    lossPolicy: {
      publishAllAttempts: true,
      singleAgentWinsAreLosses: true,
      invalidRunsCountAsLosses: true,
      notes: 'Fire drill only; no provider calls are made.',
    },
    lossRegistry: [
      { id: 'timeout', countedAsLoss: true, publicLabel: 'Timeout' },
      { id: 'invalid_output', countedAsLoss: true, publicLabel: 'Invalid output' },
      { id: 'unmeasured', countedAsLoss: true, publicLabel: 'Unmeasured attempt' },
    ],
    headlineEligible: false,
  };
  const runManifest = {
    id: `run-${evaluationManifestId}`,
    evaluationManifestId,
    contractVersion: 'orgx-bench-v1.1',
    createdAt,
    split,
    k,
    modelManifestId: modelManifest.id,
    lossRegistryId: 'loss-registry-fire-drill',
    arms: arms.map((arm) => ({
      id: arm,
      system: arm === 'raw' ? 'single_frontier' : 'adaptive_orgx',
      modelManifestId,
      budget: { tokens: 30000, calls: 12 },
    })),
    artifactHashes: {
      evaluationManifest: 'sha256:future-model-fire-drill',
      worldSplit: 'sha256:future-model-fire-drill',
    },
    notes: 'Dry-run manifest for future-model config-only drill.',
  };

  return { evaluationManifest, runManifest };
}

export function buildFutureModelFireDrillRecord({
  worlds,
  provider = 'openai',
  model = 'gpt-6-fire-drill-stub',
  split = 'public_validation',
  k = 2,
  arms = ['raw', 'orgx'],
  startedAt = new Date().toISOString(),
} = {}) {
  const started = Date.parse(startedAt);
  const { evaluationManifest, runManifest } = buildFutureModelFireDrillManifests({
    provider,
    model,
    split,
    k,
    arms,
    createdAt: startedAt,
  });
  const config = resolveManifestBoundRunConfig({
    runManifest,
    evaluationManifest,
    args: { provider, model },
  });
  const providerConfig = getProvider(provider);
  const selectedWorlds = filterWorldsBySplit(worlds ?? [], config.split);
  const jobs = buildDryRunJobs({ worlds: selectedWorlds, arms: config.arms, k: config.k });
  const completedAt = new Date(Number.isFinite(started) ? started + 1 : Date.now()).toISOString();

  return {
    ok: true,
    drill: 'future_model_config_only',
    startedAt,
    completedAt,
    elapsedMs: Number.isFinite(started) ? Date.parse(completedAt) - started : null,
    provider,
    providerApi: providerConfig.api,
    model,
    modelManifestEntryId: config.modelManifestEntry.id,
    runManifestId: runManifest.id,
    evaluationManifestId: evaluationManifest.id,
    split: config.split,
    k: config.k,
    arms: config.arms,
    worldCount: selectedWorlds.length,
    jobCount: jobs.length,
    jobs,
    zeroCodeChangeEvidence: [
      'Model selected from evaluationManifest.modelManifest.models.',
      'Run arms selected from runManifest.arms.',
      'Provider routing reused an existing provider registry entry.',
      'No provider API key or network call is required for this dry-run drill.',
    ],
    manifests: { evaluationManifest, runManifest },
  };
}

function buildDryRunJobs({ worlds, arms, k }) {
  const jobs = [];
  for (const world of worlds) {
    for (const arm of arms) {
      for (let seedIndex = 1; seedIndex <= k; seedIndex += 1) {
        jobs.push({
          worldId: world.id,
          split: world.split ?? 'public_validation',
          arm,
          seedIndex,
          episodeId: `${world.id}-${arm}-e${seedIndex}`,
        });
      }
    }
  }
  return jobs;
}

