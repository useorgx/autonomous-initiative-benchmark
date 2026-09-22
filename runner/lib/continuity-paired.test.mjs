import test from "node:test";
import assert from "node:assert/strict";
import { pairedContinuityDifference } from "./continuity-paired.mjs";
const rows = Array.from({ length: 3 }, (_, seed) =>
  ["a", "b"].flatMap((arm) =>
    [0, 1].map((variant) => ({
      family: "change",
      seed,
      variant,
      cluster_id: `c${seed}`,
      model_id: "m",
      arm,
      status: "scored",
      accepted: arm === "b",
    }))
  )
).flat();
const options = { modelId: "m", controlArm: "a", treatmentArm: "b" };
test("paired difference uses clusters and changes sign when arms swap", () => {
  const r = pairedContinuityDifference(rows, options);
  assert.equal(r.estimate, 1);
  assert.equal(r.independent_clusters, 3);
  assert.equal(r.paired_episodes, 6);
  assert.equal(
    pairedContinuityDifference(rows, {
      ...options,
      controlArm: "b",
      treatmentArm: "a",
    }).estimate,
    -1
  );
  assert.ok(r.ci_low < 0);
});
test("missing or duplicated pairs cannot manufacture a difference", () => {
  assert.throws(() => pairedContinuityDifference(rows.slice(1), options));
  assert.throws(() => pairedContinuityDifference([...rows, rows[0]], options));
});
test("blocked episodes remain in paired comparisons", () => {
  const r = pairedContinuityDifference(
    rows.map((x) =>
      x.arm === "b" ? { ...x, status: "blocked", accepted: false } : x
    ),
    options
  );
  assert.equal(r.estimate, 0);
  assert.equal(r.paired_episodes, 6);
});
