export function normalizeCriterionScores(task, scores) {
  const result = {};
  for (const criterion of task.acceptanceCriteria ?? []) {
    result[criterion.id] = clampNumber(Number(scores?.[criterion.id] ?? 0), 0, 1);
  }
  return result;
}

export function scoreCriteria(criteria, scores) {
  const totalWeight = sum((criteria ?? []).map((criterion) => Number(criterion.weight ?? 1)));
  if (!totalWeight) return 0;
  const weighted = sum(
    (criteria ?? []).map((criterion) => Number(criterion.weight ?? 1) * Number(scores[criterion.id] ?? 0))
  );
  return Number(((weighted / totalWeight) * 100).toFixed(2));
}

export function aggregateJudgments(task, judgments, disagreementThresholdPoints = 8) {
  const completedJudgments = judgments.filter((judgment) => judgment.status === 'completed');
  const criterionScores = {};

  // Strict-protocol tasks aggregate with the mean: median lets two lenient
  // judges fully outvote one strict judge, which re-saturates the top of the
  // scale exactly where hard-tier tasks need discrimination.
  const aggregate = task.judgingProtocol === 'strict' ? (values) => roundScore(avg(values)) : median;

  for (const criterion of task.acceptanceCriteria ?? []) {
    criterionScores[criterion.id] = aggregate(
      completedJudgments.map((judgment) => Number(judgment.criterionScores?.[criterion.id] ?? 0))
    );
  }

  const qualityScores = completedJudgments.map((judgment) => Number(judgment.qualityScore ?? 0));
  const completenessScores = completedJudgments.map((judgment) => Number(judgment.completeness ?? 0));
  const disagreementPoints = range(qualityScores);
  const maxCriterionDisagreementPoints = Math.max(
    0,
    ...Object.keys(criterionScores).map((criterionId) =>
      range(completedJudgments.map((judgment) => Number(judgment.criterionScores?.[criterionId] ?? 0) * 100))
    )
  );
  const lowConfidenceReasons = [];

  if (completedJudgments.length !== judgments.length) {
    lowConfidenceReasons.push('one or more judges failed');
  }
  if (disagreementPoints >= disagreementThresholdPoints) {
    lowConfidenceReasons.push(`judge quality disagreement >= ${disagreementThresholdPoints} points`);
  }
  if (maxCriterionDisagreementPoints >= disagreementThresholdPoints) {
    lowConfidenceReasons.push(`criterion disagreement >= ${disagreementThresholdPoints} points`);
  }
  if (completedJudgments.some((judgment) => judgment.humanReviewRecommended)) {
    lowConfidenceReasons.push('at least one judge recommended human review');
  }

  return {
    judgeCount: completedJudgments.length,
    qualityScore: scoreCriteria(task.acceptanceCriteria ?? [], criterionScores),
    completeness: median(completenessScores),
    criterionScores,
    disagreementPoints: Number(disagreementPoints.toFixed(2)),
    maxCriterionDisagreementPoints: Number(maxCriterionDisagreementPoints.toFixed(2)),
    humanReviewRecommended: lowConfidenceReasons.length > 0,
    lowConfidenceReasons,
  };
}

export function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return roundScore(sorted[middle]);
  return roundScore((sorted[middle - 1] + sorted[middle]) / 2);
}

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function avg(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function range(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return 0;
  return Math.max(...numeric) - Math.min(...numeric);
}

function roundScore(value) {
  return Number(value.toFixed(4));
}
