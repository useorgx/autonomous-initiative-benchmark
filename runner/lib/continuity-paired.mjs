// Development-only paired contrasts. Repeated variants within a world cluster
// are not independent samples. This bound covers bounded cluster differences;
// it is intentionally conservative and never licenses a headline claim.
export function pairedContinuityDifference(
  episodes,
  { modelId, controlArm, treatmentArm }
) {
  const groups = new Map();
  for (const row of episodes.filter(
    (e) => e.model_id === modelId && [controlArm, treatmentArm].includes(e.arm)
  )) {
    if (
      !["scored", "lost", "blocked"].includes(row.status) ||
      typeof row.accepted !== "boolean" ||
      (row.status !== "scored" && row.accepted)
    )
      throw new Error("Terminal measured outcomes required");
    const key = JSON.stringify([row.family, row.seed, row.variant]);
    const pair = groups.get(key) ?? {};
    if (pair[row.arm]) throw new Error("Duplicate paired cell");
    pair[row.arm] = row;
    groups.set(key, pair);
  }
  if (!groups.size) throw new Error("Nonempty paired cohort required");
  const clusters = new Map();
  for (const pair of groups.values()) {
    const control = pair[controlArm],
      treatment = pair[treatmentArm];
    if (
      !control ||
      !treatment ||
      typeof control.cluster_id !== "string" ||
      !control.cluster_id ||
      control.cluster_id !== treatment.cluster_id
    )
      throw new Error("Incomplete or mismatched pair");
    const values = clusters.get(control.cluster_id) ?? [];
    values.push(Number(treatment.accepted) - Number(control.accepted));
    clusters.set(control.cluster_id, values);
  }
  const means = [...clusters.values()].map(
    (values) => values.reduce((sum, x) => sum + x, 0) / values.length
  );
  const estimate = means.reduce((sum, x) => sum + x, 0) / means.length;
  const halfWidth = Math.sqrt((2 * Math.log(40)) / means.length);
  return {
    model_id: modelId,
    control_arm: controlArm,
    treatment_arm: treatmentArm,
    paired_episodes: groups.size,
    independent_clusters: means.length,
    estimate,
    ci_low: Math.max(-1, estimate - halfWidth),
    ci_high: Math.min(1, estimate + halfWidth),
    method: "paired_cluster_hoeffding_95",
    headline_eligible: false,
  };
}
