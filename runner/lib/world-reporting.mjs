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

export const HEADLINE_MIN_EPISODES_PER_CELL = 8;
const DIMS = ['outcome', 'method', 'coordination', 'judgment', 'trust'];

export function buildWorldRunReport({ worlds, arms, k, episodes, provider, model, strictHeadline = false }) {
  const byKey = (worldId, arm) => episodes.filter((e) => e.worldId === worldId && e.arm === arm);

  const perWorld = worlds.map((world) => {
    const armStats = {};
    for (const arm of arms) {
      const eps = byKey(world.id, arm);
      const passes = eps.filter((e) => e.pass).length;
      const passAtK = eps.length ? passes / eps.length : 0;
      const observedPassPowK = eps.length && eps.every((e) => e.pass) ? 1 : 0;
      const tokens = avg(eps.map((e) => e.weg?.totalTokens ?? 0));
      const cost = avg(eps.map((e) => e.weg?.costCents ?? 0));
      const toolCalls = avg(eps.map((e) => e.weg?.toolCallCount ?? 0));
      const dims = Object.fromEntries(DIMS.map((d) => [d, avg(eps.map((e) => Number(e.dimensions?.[d] ?? 0)))]));
      const qualityPerKToken = tokens > 0 ? Number((passAtK / (tokens / 1000)).toFixed(4)) : 0;
      const orchTokens = avg(eps.map((e) => (e.weg?.orchInputTokens ?? 0) + (e.weg?.orchOutputTokens ?? 0)));
      const orchestrationRatio = tokens > 0 ? Number((orchTokens / tokens).toFixed(4)) : 0;
      const injections = eps.map((e) => e.injection).filter(Boolean);
      const recovery = injections.length ? recoveryScore(injections) : null;
      armStats[arm] = {
        n: eps.length,
        passAtK: round(passAtK),
        passAtKCi95: wilsonInterval(passes, eps.length),
        passPowK: observedPassPowK,
        passPowKCurve: passPowerCurve(passAtK),
        meanTokens: Math.round(tokens),
        meanTokensCi95: bcaBootstrapMeanInterval(eps.map((e) => e.weg?.totalTokens ?? 0)),
        meanCostCents: round(cost),
        meanCostCentsCi95: bcaBootstrapMeanInterval(eps.map((e) => e.weg?.costCents ?? 0)),
        meanToolCalls: round(toolCalls),
        qualityPerKToken,
        meanOrchestrationTokens: Math.round(orchTokens),
        orchestrationRatio,
        dimensions: Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, round(v)])),
        dimensionsCi95: Object.fromEntries(
          DIMS.map((d) => [d, bcaBootstrapMeanInterval(eps.map((e) => Number(e.dimensions?.[d] ?? 0)))])
        ),
        recovery,
        failures: eps.filter((e) => e.failed).length,
      };
    }
    const rawSat = (armStats.raw?.passAtK ?? 0) >= 1;
    return { worldId: world.id, domain: world.domain, admission: rawSat ? 'saturated' : 'admitted', arms: armStats };
  });

  const uplift = buildUplift({ perWorld, arms });
  const pairedComparisons = buildPairedComparisons({ worlds, arms, episodes });
  const difficultyCurves = buildDifficultyCurves({ worlds, arms, episodes });
  const admitted = perWorld.filter((w) => w.admission === 'admitted').length;
  const report = {
    admissionSummary: { admitted, saturated: perWorld.length - admitted, rule: 'admitted if raw baseline pass@k < 1.0 (headroom exists)' },
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
      ci95: {
        passRates: 'Wilson score interval',
        means: 'BCa bootstrap interval',
      },
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

  for (const arm of arms.filter((a) => a !== 'raw')) {
    const worldsWith = perWorld.filter((w) => w.arms[arm]);
    if (worldsWith.length === 0) continue;
    const dimsAgg = {};
    for (const d of DIMS) {
      const raw = avg(worldsWith.map((w) => w.arms.raw?.dimensions?.[d] ?? 0));
      const a = avg(worldsWith.map((w) => w.arms[arm]?.dimensions?.[d] ?? 0));
      dimsAgg[d] = { raw: round(raw), arm: round(a), uplift: round(a - raw) };
    }
    const m = (sel) => round(avg(worldsWith.map(sel)));
    uplift[arm] = {
      passAtK: { raw: m((w) => w.arms.raw?.passAtK ?? 0), arm: m((w) => w.arms[arm].passAtK), uplift: round(m((w) => w.arms[arm].passAtK) - m((w) => w.arms.raw?.passAtK ?? 0)) },
      passPowK: { raw: m((w) => w.arms.raw?.passPowK ?? 0), arm: m((w) => w.arms[arm].passPowK), uplift: round(m((w) => w.arms[arm].passPowK) - m((w) => w.arms.raw?.passPowK ?? 0)) },
      qualityPerKToken: { raw: m((w) => w.arms.raw?.qualityPerKToken ?? 0), arm: m((w) => w.arms[arm].qualityPerKToken), uplift: round(m((w) => w.arms[arm].qualityPerKToken) - m((w) => w.arms.raw?.qualityPerKToken ?? 0)) },
      meanTokens: { raw: Math.round(avg(worldsWith.map((w) => w.arms.raw?.meanTokens ?? 0))), arm: Math.round(avg(worldsWith.map((w) => w.arms[arm].meanTokens))) },
      dimensions: dimsAgg,
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

function avg(a) {
  return a.length ? a.reduce((x, y) => x + Number(y || 0), 0) / a.length : 0;
}

function round(n) {
  return Number(Number(n).toFixed(3));
}
