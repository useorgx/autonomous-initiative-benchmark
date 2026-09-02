import { computeCorpusEligibility } from './corpus-splits.mjs';
import {
  bcaBootstrapMeanInterval,
  pairedBinaryComparison,
  passPowerCurve,
  wilsonInterval,
} from './statistics.mjs';
import {
  assessMonotoneDifficulty,
  estimateReliabilityHorizons,
} from './parametric-worlds.mjs';
import { recoveryScore } from './resilience-metrics.mjs';
import { classifyObservedHeadroom, mean as evidenceMean, round as evidenceRound, summarizeDimension, summarizeEpisodeResources } from './resource-telemetry.mjs';

export const HEADLINE_MIN_EPISODES_PER_CELL = 8;
const DIMS = ['outcome', 'method', 'coordination', 'judgment', 'trust'];

export function buildWorldRunReport({ worlds, arms, k, episodes, provider, model, strictHeadline = false }) {
  const byKey = (worldId, arm) => episodes.filter((episode) => episode.worldId === worldId && episode.arm === arm);

  const perWorld = worlds.map((world) => {
    const armStats = {};
    for (const arm of arms) {
      const eps = byKey(world.id, arm);
      const passes = eps.filter((episode) => episode.pass).length;
      const passAtK = eps.length ? passes / eps.length : 0;
      const observedPassPowK = eps.length && eps.every((episode) => episode.pass) ? 1 : 0;
      const resources = summarizeEpisodeResources(eps);
      const tokens = resources.meanTokens;
      const cost = resources.meanCostCents;
      const toolCalls = evidenceMean(eps.map((episode) => Number(episode.weg?.toolCallCount ?? 0)));
      const dimensionSummaries = Object.fromEntries(DIMS.map((dimension) => [dimension, summarizeDimension(eps, dimension)]));
      const qualityPerKToken = tokens != null && tokens > 0 ? Number((passAtK / (tokens / 1000)).toFixed(4)) : null;
      const orchestrationValues = eps.map((episode) => {
        const input = episode.weg?.orchInputTokens;
        const output = episode.weg?.orchOutputTokens;
        return Number.isFinite(input) || Number.isFinite(output) ? Number(input ?? 0) + Number(output ?? 0) : null;
      }).filter(Number.isFinite);
      const orchTokens = resources.complete && orchestrationValues.length === eps.length ? evidenceMean(orchestrationValues) : null;
      const orchestrationRatio = tokens != null && orchTokens != null && tokens > 0 ? Number((orchTokens / tokens).toFixed(4)) : null;
      const injections = eps.map((episode) => episode.injection).filter(Boolean);
      const recovery = injections.length ? recoveryScore(injections) : null;
      armStats[arm] = {
        n: eps.length,
        passAtK: round(passAtK),
        passAtKCi95: wilsonInterval(passes, eps.length),
        passPowK: observedPassPowK,
        passPowKCurve: passPowerCurve(passAtK),
        resourceTelemetryComplete: resources.complete,
        resourceTelemetryCompleteEpisodes: resources.completeEpisodes,
        meanTokens: tokens == null ? null : Math.round(tokens),
        meanTokensCi95: resources.complete ? bcaBootstrapMeanInterval(resources.tokenValues) : null,
        knownMeanTokenLowerBound: resources.knownMeanTokenLowerBound == null ? null : Math.round(resources.knownMeanTokenLowerBound),
        meanCostCents: round(cost),
        meanCostCentsCi95: resources.complete ? bcaBootstrapMeanInterval(resources.costValues) : null,
        knownMeanCostLowerBoundCents: round(resources.knownMeanCostLowerBoundCents),
        meanToolCalls: round(toolCalls),
        qualityPerKToken,
        meanOrchestrationTokens: orchTokens == null ? null : Math.round(orchTokens),
        orchestrationRatio,
        dimensions: Object.fromEntries(DIMS.map((dimension) => [dimension, round(dimensionSummaries[dimension].value)])),
        dimensionCoverage: Object.fromEntries(DIMS.map((dimension) => [dimension, dimensionSummaries[dimension].measuredEpisodes])),
        dimensionsCi95: Object.fromEntries(DIMS.map((dimension) => [
          dimension,
          dimensionSummaries[dimension].values.length ? bcaBootstrapMeanInterval(dimensionSummaries[dimension].values) : null,
        ])),
        recovery,
        failures: eps.filter((episode) => episode.failed).length,
      };
    }
    return {
      worldId: world.id,
      domain: world.domain,
      headroomDiagnostic: classifyObservedHeadroom(armStats.raw),
      arms: armStats,
    };
  });

  const uplift = buildUplift({ perWorld, arms });
  const pairedComparisons = buildPairedComparisons({ worlds, arms, episodes });
  const difficultyCurves = buildDifficultyCurves({ worlds, arms, episodes });
  const rawSamplePerfect = perWorld.filter((world) => world.headroomDiagnostic === 'raw_sample_perfect').length;
  const report = {
    admissionSummary: {
      rawSamplePerfect,
      rawHeadroomObserved: perWorld.filter((world) => world.headroomDiagnostic === 'raw_headroom_observed').length,
      rawUnobserved: perWorld.filter((world) => world.headroomDiagnostic === 'raw_unobserved').length,
      retirementEligible: 0,
      rule: 'Diagnostic only. A sample-perfect raw cell is not saturation or a world-retirement decision.',
    },
    benchmark: 'orgx-bench-v2-instrumented-worlds',
    corpus: computeCorpusEligibility(worlds),
    generatedAtNote: 'timestamp stamped by caller',
    provider,
    model,
    k,
    arms,
    worldCount: worlds.length,
    scoring: 'deterministic validators only (no LLM judge)',
    statistics: {
      ci95: { passRates: 'Wilson score interval', means: 'BCa bootstrap interval' },
      passPowerK: [1, 4, 8, 16, 32],
      headlineMinEpisodesPerCell: HEADLINE_MIN_EPISODES_PER_CELL,
      pairedSeedComparison: true,
      reliabilityHorizonThresholds: [0.5, 0.8],
    },
    perWorld,
    uplift,
    pairedComparisons,
    difficultyCurves,
  };

  if (strictHeadline) assertHeadlineStatisticalContract(report);
  return report;
}

export function assertHeadlineStatisticalContract(report) {
  const errors = [];
  if (!report.corpus?.headlineEligible) {
    errors.push('strict headline mode requires all worlds to be private_holdout.');
  }
  if (Number(report.k ?? 0) < HEADLINE_MIN_EPISODES_PER_CELL) {
    errors.push(`strict headline mode requires k >= ${HEADLINE_MIN_EPISODES_PER_CELL}.`);
  }
  for (const world of report.perWorld ?? []) {
    for (const [arm, stats] of Object.entries(world.arms ?? {})) {
      if (Number(stats.n ?? 0) < HEADLINE_MIN_EPISODES_PER_CELL) {
        errors.push(`${world.worldId}/${arm} has n=${stats.n}; strict headline mode requires n >= ${HEADLINE_MIN_EPISODES_PER_CELL}.`);
      }
      if (stats.passAtKCi95?.low == null || stats.passAtKCi95?.high == null) {
        errors.push(`${world.worldId}/${arm} is missing passAtKCi95.`);
      }
      if (!stats.resourceTelemetryComplete) {
        errors.push(`${world.worldId}/${arm} has incomplete resource telemetry.`);
      }
      if (stats.meanCostCentsCi95?.low == null || stats.meanCostCentsCi95?.high == null) {
        errors.push(`${world.worldId}/${arm} is missing meanCostCentsCi95.`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`strict headline statistical contract failed:\n- ${errors.join('\n- ')}`);
  }
}

function buildUplift({ perWorld, arms }) {
  const uplift = {};
  if (!arms.includes('raw')) return uplift;

  const aggregatePair = (worlds, rawSelector, armSelector) => {
    const pairs = worlds.map((world) => ({ raw: rawSelector(world), arm: armSelector(world) }))
      .filter((pair) => pair.raw != null && pair.arm != null);
    if (pairs.length === 0) return { raw: null, arm: null, uplift: null, comparableWorlds: 0 };
    const raw = evidenceMean(pairs.map((pair) => pair.raw));
    const candidate = evidenceMean(pairs.map((pair) => pair.arm));
    return { raw: round(raw), arm: round(candidate), uplift: round(candidate - raw), comparableWorlds: pairs.length };
  };

  for (const arm of arms.filter((candidate) => candidate !== 'raw')) {
    const worldsWith = perWorld.filter((world) => world.arms[arm] && world.arms.raw);
    if (worldsWith.length === 0) continue;
    const dimensions = Object.fromEntries(DIMS.map((dimension) => [dimension, aggregatePair(
      worldsWith,
      (world) => world.arms.raw.dimensions?.[dimension],
      (world) => world.arms[arm].dimensions?.[dimension],
    )]));
    uplift[arm] = {
      passAtK: aggregatePair(worldsWith, (world) => world.arms.raw.passAtK, (world) => world.arms[arm].passAtK),
      passPowK: aggregatePair(worldsWith, (world) => world.arms.raw.passPowK, (world) => world.arms[arm].passPowK),
      qualityPerKToken: aggregatePair(worldsWith, (world) => world.arms.raw.qualityPerKToken, (world) => world.arms[arm].qualityPerKToken),
      meanTokens: aggregatePair(worldsWith, (world) => world.arms.raw.meanTokens, (world) => world.arms[arm].meanTokens),
      dimensions,
    };
  }
  return uplift;
}

function buildPairedComparisons({ worlds, arms, episodes }) {
  if (!arms.includes('raw')) return {};
  const comparisons = {};
  for (const arm of arms.filter((a) => a !== 'raw')) {
    comparisons[arm] = Object.fromEntries(
      worlds.map((world) => {
        const baseline = episodes.filter((episode) => episode.worldId === world.id && episode.arm === 'raw');
        const candidate = episodes.filter((episode) => episode.worldId === world.id && episode.arm === arm);
        return [world.id, pairedBinaryComparison(baseline, candidate)];
      })
    );
  }
  return comparisons;
}

function buildDifficultyCurves({ worlds, arms, episodes }) {
  if (!episodes.some((episode) => Number.isFinite(episodeDifficultyScore(episode)))) {
    return {};
  }

  const curves = {};
  for (const world of worlds) {
    const worldId = world.id;
    const worldEpisodes = episodes.filter((episode) => episodeBaseWorldId(episode) === worldId);
    const armCurves = {};
    for (const arm of arms) {
      const armEpisodes = worldEpisodes.filter((episode) => episode.arm === arm);
      const groups = groupByDifficulty(armEpisodes);
      if (groups.length === 0) continue;
      const points = groups.map((group) => {
        const passes = group.episodes.filter((episode) => episode.pass).length;
        const passAtK = group.episodes.length ? passes / group.episodes.length : 0;
        return {
          difficultyId: group.id,
          label: group.label,
          difficultyScore: round(group.difficultyScore),
          n: group.episodes.length,
          passAtK: round(passAtK),
          passAtKCi95: wilsonInterval(passes, group.episodes.length),
          passPowKCurve: passPowerCurve(passAtK),
        };
      });
      armCurves[arm] = {
        points,
        reliabilityHorizons: estimateReliabilityHorizons(points),
        monotonicity: assessMonotoneDifficulty(points),
      };
    }
    if (Object.keys(armCurves).length > 0) {
      curves[worldId] = armCurves;
    }
  }
  return curves;
}

function groupByDifficulty(episodes) {
  const groups = new Map();
  for (const episode of episodes) {
    const difficultyScore = episodeDifficultyScore(episode);
    if (!Number.isFinite(difficultyScore)) continue;
    const id = String(episode.difficulty?.id ?? episode.difficultyId ?? difficultyScore);
    const label = String(episode.difficulty?.label ?? episode.difficultyLabel ?? id);
    const key = `${id}:${difficultyScore}`;
    const group = groups.get(key) ?? { id, label, difficultyScore, episodes: [] };
    group.episodes.push(episode);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.difficultyScore - right.difficultyScore);
}

function episodeDifficultyScore(episode) {
  return Number(
    episode.difficulty?.difficultyScore ??
      episode.difficulty?.score ??
      episode.difficultyScore
  );
}

function episodeBaseWorldId(episode) {
  return episode.baseWorldId ?? episode.worldId;
}

function avg(values) {
  return evidenceMean(values) ?? 0;
}

function round(value) {
  return evidenceRound(value);
}
