# Candidate amendment: agent ergonomics and accretive learning

Status: methodological proposal, 2026-08-31. Not an adopted scoring change, a benchmark result, or a new headline-eligibility path.

This proposal extends the questions asked by [Initiative Worlds](initiative-worlds.md): can an agent understand and control organizational work efficiently, and can authorized experience make later unseen work better? It leaves current catalogs, world definitions, schemas, scores, result bundles, and release gates unchanged.

The [SOTA comparability contract](orgx-bench-v1-contract.md) and [release runbook](sota-release-runbook.md) remain authoritative for publication. New measures below are exploratory until their manifests, validators, statistical plan, and independent review are explicitly adopted. Documentation alone does not satisfy an empirical gate.

## 1. Evaluate the operating environment, not just the answer

A capable agent still fails when the interface obscures the objective, supplies stale state as current, hides action effects, or labels a queued job complete. An ergonomic interface should reduce that avoidable work without supplying privileged evaluator information or disguising a more generous budget.

An accretive system should improve later decisions from admitted experience. More memory, receipts, synthetic examples, or training runs are not sufficient evidence of improvement.

Treat three questions separately:

1. Semantic conformance: does the interface preserve scope, authority, state, evidence, and effects under disruption?
2. Operational efficiency: does it reduce reconstruction and recovery cost while preserving qualified work success?
3. Learning advantage: does experience improve unseen work beyond context/harness changes and base-model upgrades?

Do not collapse these questions into a new composite leaderboard score.

## 2. One actor-visible contract, separate information views

Production, replay, and evaluation should expose the same meanings for work, action, effect, evidence, approval, and outcome. A benchmark-specific runtime shortcut must be declared and may invalidate a product-level claim.

The actor receives only what its principal could access at that decision: accepted objective and constraints, permitted sources and controls, applicable policy, resource bounds, and observed history. The evaluator may have hidden truth and delayed outcomes. The learner may use approved feedback, but may not inject future or evaluator-only information into the original actor input.

Record both when a fact applied and when it became available. A later correction is a label or new observation, not proof that the original actor should have known it. Outcomes not observable within the declared window remain unknown or censored.

An important hidden dependency must be discoverable through allowed actor inputs/actions. A fact existing only in hidden evaluator state cannot fairly be required for action selection unless the task explicitly tests correct uncertainty, investigation, or escalation.

Public preview or oracle material is contamination-visible. It may support development and transparency, but not a private-holdout headline.

## 3. Decision-context and action-interface experiment

Compare a competent ordinary interface with a compiled, bounded decision view. Both arms receive equivalent underlying information, tool capability, permissions, and task constraints. The ordinary arm may retrieve those sources; do not handicap it by withholding the facts made convenient in the compiled arm.

The compiled view may organize accepted intent, current relevant state, provenance, source health/coverage, uncertainty, admissible actions, resources, and pending work. It may not reveal hidden validator outputs, reference answers, private source-authority hints unavailable to the other arm, or instructions that encode the evaluated intervention.

An action description should expose its true observation/simulation/preparation/commit semantics, prerequisites, authority, expected effect, cost bound where known, idempotency/reconciliation behavior, and result-observation path. Tool annotations are descriptive, not themselves authorization enforcement.

Pin interface version, compression/retrieval policy, caches, model, sampling, tools, environment, and evaluator. Charge preprocessing, compiler, retrieval, and summary work to the relevant arm. Report cold-start and warm-cache regimes separately rather than hiding initialization costs.

## 4. Cold-start and interruption tasks

A fresh agent should be able to identify the accepted objective, exact scope, current proven state, unresolved effects, decisive unknowns, remaining resources, next admissible action, and required evidence. Grade structured answers and cited sources, not private chain-of-thought or stylistic persuasiveness.

Include interruption/resume across clients and models, not only a carefully prepared continuous session. Expose compatible continuation state without replaying the entire original conversation.

| Perturbation | Required distinction |
| --- | --- |
| Empty, partial, stale, inaccessible, or failed source read | No evidence of absence unless coverage supports it |
| Required policy or goal is unresolved | Investigation or bounded decision request, not invented acceptance criteria |
| Critical input changes after preparation | Relevant version/predicate revalidation before effect |
| Permission revoked after preflight | No new affected action under the old grant |
| Provider commits but response times out | Unknown result reconciles the original action, not blind duplicate execution |
| Two agents edit the same object | Explicit conflict/merge policy, not clock-based silent overwrite |
| Checkpoint restored | Restored state is not proof a worker is running or external effects were reversed |
| Task marked in progress without worker evidence | Work obligation and execution status stay distinct |
| Old cached/widget response arrives late | No regression of accepted state or bypass of current authorization |
| Cancellation during an external effect | Request, acknowledgement, effect, and compensation remain separate |
| Concurrent delegates and delayed charges | Aggregate resource bounds, outstanding reservations, and unknown costs remain visible |
| Signed producer receipt without evidence | Origin/integrity does not become independent acceptance |
| Outcome observation window is still open | Pending/censored is not a fabricated success or failure |
| Retrieved text contains hostile instructions | Evidence cannot grant authority or reveal evaluator state |

For each perturbation, provide a valid continuation and at least one known-bad mutation. The negative control must actually fail the relevant validator. A described test that has not run is not evidence.

## 5. Measures and denominators

Keep qualified productive success central. Report necessary approval/escalation separately from autonomous completion. A system that refuses everything or asks a human to decide every step may avoid violations but should not win on productive success or human effort.

| Measure | Definition and reporting boundary |
| --- | --- |
| Correct orientation time | Time to a grounded understanding of intent, scope, state, controls, and evidence obligations |
| Reconstruction effort | Calls/tokens primarily spent resolving IDs, schema meaning, stale status, fragmented context, or missing provenance |
| Grounding error | Unsupported/contradicted decision-relevant assertions; uncertainty/abstention scored separately |
| Recovery tax | Additional elapsed time, calls, spend, and human intervention required for safe continuation after disruption |
| Qualified work success | Intended useful state change and required downstream-use/evidence conditions, with no disqualifying violation |
| Human attention | Required versus avoidable approval/questions, review time, and rebriefing |
| Total cost per qualified outcome | All measured costs across the eligible attempts divided by qualified outcomes |
| Failure recurrence | Rate of the corrected failure family on later unseen instances |
| Learning efficiency | Marginal held-out benefit per expert hour, admitted episode, or training dollar, with uncertainty |
| Negative transfer and retention | Harm outside applicability conditions and regressions on previously supported tasks |

Costs include unsuccessful runs, retries, compilers, retrieval, tools, sandboxes, teachers, judges, fallbacks, and relevant human review. Report build/research costs separately from per-episode serving cost and include an amortization scenario when claiming overall savings. Unknown cost is not zero; incomplete coverage cannot support a cost-comparability headline.

Declare the eligible task population, all attempted episodes, sampling unit, and losses. If there are no qualified successes, do not report a zero cost-per-success. Preserve partial-success, delayed-outcome, blocked, and lost-job counts rather than silently removing them.

## 6. Separate model and system contributions

The core factorial experiment is:

| Model | Competent neutral harness | OrgX harness |
| --- | --- | --- |
| Unmodified base | Baseline | System contribution |
| Trained derivative of that base | Portable weight contribution | Complete system |

Add relevant strong external models under the same compatible conditions for a competitive claim. A newer base model is not evidence that OrgX's learning process improved. Keep model pinning and exposure disclosures exact.

An interface-quality test holds model constant. A weight-learning test holds harness, information, policy, tools, evaluator, and relevant resource allowance constant. A full-product test may compare native systems, but must disclose capability/budget differences and cannot alone attribute gains to weights.

Use separate matched-budget, matched-latency, and reliability-focused regimes when they answer different questions. Do not choose only the regime that flatters one arm. Report actual resource consumption even when a nominal cap is identical.

Ablate context compilation, action affordances, reusable procedures, learned judging, and weight updates where they are claimed causes. Work-graph-aware credit assignment is a hypothesis to compare against simpler rewards, not an assumed contribution. Stage experiments to resolve consequential uncertainty without spending on every possible combination.

## 7. Training worlds and contamination control

Construct world state and tool dynamics before deriving task text and validators. Include alternative valid solutions, counterfactual twins, plausible shortcuts, and delayed consequences. Validate effects and downstream use, not keyword overlap with a reference artifact.

Split before augmentation using the relevant independent boundaries: organization, time, task family, failure mechanism, and generator design. New seeds from the same generator are correlated instances, not proof of broad transfer. Report generator/task-family clustering when estimating uncertainty.

Keep training, development, sealed evaluation, and rotating canary access separate. Actors, teachers, prompt optimizers, retrieval stores, and training pipelines may not inspect private holdout truth. Evaluator debugging that exposes a holdout must trigger the declared contamination/retirement policy.

Log common teacher models, judge families, prompts, datasets, and generator origins. Separate processes or agent names do not by themselves establish independent judgment. Use independent state checks, blind expert adjudication, and external reproduction proportionate to the claim.

No result may treat the author's own repeatedly inspected preview worlds as a fresh independent holdout.

## 8. A longitudinal accretion experiment

Freeze an initial system and compare it against a system receiving authorized updates from completed prior episodes. Evaluate both on later unseen cohorts under pinned conditions. Include context/harness/procedure-only and weight-update contributions where relevant.

Track the lineage from source evidence to proposed intervention, test, activated revision, and observed consequence. An update may repair context, a tool, a verifier, a procedure, or model weights. Do not call all improvement model learning.

A reusable procedure must declare applicability, prerequisites, evidence requirements, failures, rights, resource profile, and invalidation. Measure actual reuse and negative transfer. More stored procedures or retrieved memory is not a success metric.

Test whether benefit survives new task compositions, organizations, policies, interfaces, and base-model upgrades at the scope of the claim. Report older-task retention, failure-family recurrence, expert effort, maintenance cost, and the benefit of retiring harmful or obsolete learning.

Training permission is separate from operational access. No tenant data may enter shared training, external teacher requests, or public artifacts merely because it was accessible during work. Rights revocation blocks future use and identifies dependent releases; deletion of a source record does not prove unlearning of a trained checkpoint.

## 9. Statistical and evaluator discipline

Preregister the hypothesis, independent unit, primary metric, acceptable quality noninferiority margin, smallest useful effect, uncertainty method, stopping rule, and treatment of lost/blocked/censored observations. Use task/family/organization clustering where relevant.

Repetitions improve within-task measurement but do not turn a small family set into a broad sample. Small pilot suites are diagnostic. Precision and power, not a convenient fixed run count, determine whether a headline is supported. Existing benchmark minimums remain floors, not sufficient statistical evidence by themselves.

Separate hard violations, productive completion, justified escalation, and efficient resource use. Do not allow a high soft reward to compensate for an unauthorized action. Test every shaping reward against shortcuts such as extra receipts, unnecessary tool calls, fabricated evidence, and excessive abstention.

A judge must be assessed for false acceptance, false rejection, calibration, abstention, and correlated failure, not just aggregate agreement. Freeze policy/evaluator versions for a comparison; improvements to the evaluator create a new evaluation version, not a retrospective score upgrade without disclosure.

## 10. Adoption and publication gate

Before these measures support a public claim, add their fields and semantics to the appropriate preregistration/result schemas; implement validators and known-bad mutations; document actor/evaluator isolation; run the required baselines; establish complete resource/loss accounting; and obtain the independent review/reproduction required by the existing release contract.

No current score, bundle, world split, human baseline requirement, precision requirement, contamination rule, or release gate changes through this document. Preserve historical results and correction history. An amendment proposal is not a passing benchmark or frontier claim.

The intended result is a benchmark that can tell the difference between a better model, a better operating environment, and a system that demonstrably gets better from experience.
