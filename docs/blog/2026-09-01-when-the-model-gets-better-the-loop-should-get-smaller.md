---
title: "When the model gets better, the agent loop should get smaller"
date: "2026-09-01"
author: "Hope Atina"
status: draft
summary: "What AutomationBench and our own experiments taught us about paying for verification that does not improve the outcome."
---

The easy reaction to a new model release is to swap a model ID and post a better score.

The harder question is whether the machinery around the model still earns its keep.

One of our internal experiments made that question uncomfortable. A raw tool-using agent completed every tested world in both repetitions. Our adaptive verification loop matched that result—and used about twice the tokens. A more aggressive verification loop used even more tokens and did worse.[1]

More agent activity was not more progress.

That is the lens I am bringing to AutomationBench after seeing it in Anthropic's Fable 5.1 announcement.[2]

## Grade the company the agent leaves behind

AutomationBench tests business workflows across simulated applications. The important output is not the assistant's explanation. It is the state of the CRM, inbox, spreadsheet or ticketing system after the work ends. The public suite has 600 scored tasks across six business domains; its 200 simple tasks are separate. Strict completion requires every scored assertion to pass.[3]

That distinction matters. An agent can produce a persuasive summary while updating the wrong account or notifying an unauthorized recipient. The explanation can be excellent and the work can still be wrong.

Our benchmark has been moving toward the same distinction. The early OrgX catalog emphasized artifacts. Initiative Worlds adds state changes, dependencies, approvals and evidence. Its question is not just whether an agent can complete an isolated workflow, but whether a system can carry work forward without losing the conditions that made it acceptable.[4]

These are complementary tests. We should pass an external workflow benchmark without rewriting its rules, then test the organizational responsibilities it does not settle.

## A score belongs to a configuration

Anthropic reports 31.4% for Fable 5.1. Zapier's leaderboard identifies that entry as Fable 5.1 with an Opus 5 fallback. It says the fallback handled 260 of 657 tasks and that the displayed cost excludes fallback tokens.[2][5]

Using a fallback is a reasonable system design. But it changes the claim: the evaluated object includes that fallback, and its cost must include it too.

There is another boundary: the official leaderboard uses private tasks. A score on the public task set is not directly comparable.[3]

So we do not currently have a defensible "OrgX beats Fable 5.1 on AutomationBench" claim. We have not established an OrgX AutomationBench score in this work.

The worthwhile experiment is more precise: **with the same model, tasks and tools, does OrgX improve the outcome enough to justify its overhead?**

## What our own experiment actually showed

Here is a historical public Initiative Worlds run from June 16, 2026. It used DeepSeek V4 Flash on eight worlds, with two repetitions per arm.[1]

| Execution policy | Worlds passing both repetitions | Mean tokens per episode |
| --- | ---: | ---: |
| Raw tool-using agent | 8 of 8 | 7,915 |
| Reflexive verification | 7 of 8 | 20,484 |
| Adaptive verification | 8 of 8 | 16,195 |

Adaptive verification avoided the observed loss, but it did not beat the raw baseline. It consumed approximately 2.05 times the tokens for the same observed success. Reflexive verification consumed approximately 2.59 times the tokens and failed a world.[1]

These are small, public, contamination-visible experiments. They compare experimental harness policies—not the entire production OrgX product. "Worlds passing both repetitions" is also not AutomationBench's per-task score. Our repository explicitly marks these results as ineligible for a frontier-performance headline.[1][6]

Still, there is a useful engineering lesson here: verification is an intervention with costs and possible side effects. It does not become valuable merely because we label it assurance.

A loop should earn its next model call.

## What we are changing

The first change is accounting. We added a comparison layer for native AutomationBench exports that checks task-contract identity, keeps missing attempts in the denominator, separates partial credit from success, and refuses to treat an incomplete cost record as a free run. Same-model harness comparisons are separated from multi-model fallback systems.[7]

This tooling checks exported evidence; it is not an independent grader or a completed OrgX runtime integration. That distinction is deliberately visible.

The next step is to connect the actual OrgX runtime to the unchanged simulator. All arms must start in identical worlds, see the same available tools, and remain unable to inspect the grader. A competent generic verification control belongs alongside the stock runner and OrgX. Otherwise we might mistake "spent more compute" for a product advantage.[7]

We will evaluate strict success and all-in cost together. We also need to see the losses: where OrgX fixes a baseline failure, where it damages a correct attempt, and where it spends extra money to produce the same result. Those three cases require different engineering responses.

## The benchmark should grow in responsibility, not just size

My proposal for the next generation of Initiative Worlds is to make responsibilities harder rather than merely making prompts longer.[7]

A customer requirement changes after work starts. Two agents act on overlapping state. Approval applies to one version of an artifact, not the revised one. A workflow looks correct immediately but creates a bad downstream consequence. A new session inherits the work without inheriting every token of the conversation.

These are the conditions we should measure while retaining a frozen suite that makes progress comparable over time. Harder worlds should arrive as new versions, not as silent changes to yesterday's scoreboard.

The training opportunity follows from the same design. Preserve independently checked trajectories and their costs. Learn which uncertainty deserved another lookup, which action required approval, and which extra review accomplished nothing. Keep the training scenarios separate from the evaluation worlds.[7]

I would rather train a policy that knows when to stop than reward a model for producing an elaborate trace.

## A more demanding definition of progress

The goal is not to demonstrate that OrgX can make a model work longer.

It is to show that a system can turn more of the model's capability into accepted work—with less avoidable rework, lower unnecessary cost, and authority boundaries intact.

Sometimes that should mean more structure. As models improve, it should also mean confidently removing structure that no longer pays for itself.

The next results post needs to show that tradeoff, including the cases where the bare model wins. Until then, the honest contribution is the experiment, the evidence we already have, and the changes that make a stronger claim testable.

### Sources and reproduction

[1] [Pinned historical run report](https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/results/worlds-real-2026-06-16/report.json). Table values come from its per-world/aggregate report; token ratios are calculated from the reported means. This article does not claim the historical run was rerun today.

[2] [Anthropic: Claude Fable 5.1 and Mythos 5.1](https://www.anthropic.com/claude-fable-and-mythos-5-1), consulted September 1, 2026.

[3] [AutomationBench public repository](https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/README.md).

[4] [Initiative Worlds architecture](https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/docs/initiative-worlds.md).

[5] [Zapier leaderboard and fallback footnote](https://zapier.com/benchmarks), consulted September 1, 2026, displayed version 1.0.6. Scores and configurations can change.

[6] [OrgX public evidence boundary](https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/README.md).

[7] [Comparison implementation, limitations, and proposed execution protocol](../automationbench-comparison-2026-09-01.md). Run the new tooling tests with `node --test runner/lib/automationbench-report.test.mjs`. Passing tooling tests are not model benchmark performance.
