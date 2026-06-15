# We had DeepSeek judge OrgX's benchmark run. 12 for 12.

So this morning I asked for something simple: run the public benchmark against OrgX, and don't let OpenAI grade its own homework — bring in a judge from a completely different vendor and see if the result holds.

Quick context if you're new here. The OrgX Autonomous Initiative Benchmark is our public proof surface — 15 real organizational tasks across product, design, engineering, marketing, sales, ops. Launch briefs, postmortems, release-readiness memos, escalation playbooks. The stuff a founding team actually has to produce. Every task has weighted acceptance criteria and a timed human baseline. The repo is public, the bundles are public, the methodology is public.

And here's the thing that's been bugging me about it: the judge panel was three OpenAI models. Our baseline runs were OpenAI models. One vendor generating + the same vendor scoring. Even if the scores are honest, you can't *prove* they're honest. That's a monoculture, and monocultures fail in correlated ways.

Today it failed in the most literal way possible. Our OpenAI account hit its quota mid-run, and so the entire judging panel went down with the generation lane. One billing state, whole evaluation pipeline dead. The benchmark caught a real platform gap before any customer did — we logged it, it's in the public gap analysis, and the fix is exactly what we shipped today.

## What we shipped

The harness is now provider-agnostic. There's a provider registry — OpenAI Responses API, OpenRouter, DeepSeek direct — and judge specs are just `provider:model:effort`. So `--judge-preset deepseek` gives you a three-judge DeepSeek panel (v4-flash low, v3.2 medium, v4-pro high reasoning) served through OpenRouter. Artifacts generated on one vendor, scored by a vendor that has zero stake in the outcome. Cross-provider verification as a one-flag operation.

Two more lanes landed with it:

- `import:live` — take artifacts from a real OrgX product run and turn them into a standard bundle, judged by the exact same pipeline as the API smoke runs. The flagship "run it in OrgX" path finally produces auditable public artifacts.
- `compare:bundles` — pairwise preference judging. Both artifacts, same task, judge picks. Every pair judged in both orders so position bias cancels, and a judge's vote only counts when both orderings agree.

That last one matters more than it looks. More on that in a second.

## The run

15/15 catalog tasks, executed through the OrgX agent pack — Dana on the design tasks, Mark on marketing, Eli on engineering, Orion on ops, Sage on sales, Pace on product, Xandy on the cross-functional plan. 100% autonomous completion, zero approval requests, 28 seconds to 2 minutes 27 per task. Tasks the human baseline prices at 10 to 120 minutes each.

Then the DeepSeek panel scored everything — our run AND the published gpt-5-nano baseline, identical judges, identical protocol.

Absolute rubric scores: OrgX 100.0 mean, baseline 98.94. Basically a tie, right? And so I'm looking at that and realizing the rubric is the problem. "Includes a positioning statement." "Includes a CTA strategy." Any competent frontier model clears that bar. Median-of-judges pins at 100 and the benchmark stops discriminating. Ceiling effect. This is exactly why we keep saying the public catalog is the validation set, not the frontier suite.

So pairwise. Same DeepSeek judges, but now they see both artifacts side by side and have to pick which one actually satisfies the criteria better. No ceiling to hide under.

**12 out of 12 shared tasks: OrgX. 71 of 72 individual judge votes.** Every judge, both orderings, every domain. The one dissenting vote didn't survive its own consistency check. Total judging cost: 23 cents.

And the agreement signals point the same direction — judges disagreed with each other less on our artifacts (4.1 pts vs 5.9) and flagged them for human review half as often (33% vs 58%).

## Then we made DeepSeek a contestant too

Fair question at this point: maybe DeepSeek judges just like a certain style. So we adapted the generation lane the same way as the judging lane — one flag, `--provider openrouter --model deepseek/deepseek-v3.2` — and ran the full 15-task catalog with DeepSeek as the *generator*. 100% autonomous completion, 0.12 cents per task. Strong run.

Then everything head-to-head, pairwise:

- OrgX vs DeepSeek v3.2, judged by DeepSeek's own models: **OrgX 15/15** (88 of 90 votes). DeepSeek judges voting against DeepSeek artifacts.
- Same matchup, judged by Claude sonnet-4.6 instead: **OrgX 15/15** (30 of 30). Different vendor, same sweep.
- DeepSeek v3.2 vs the gpt-5-nano baseline: DeepSeek wins 6, ties 5, loses 1.

So the ordering is OrgX ≫ DeepSeek v3.2 > gpt-5-nano, and the gap between OrgX and a strong raw model is much bigger than the gap between the raw models themselves. That's the part I actually care about. The margin isn't coming from model choice — it's coming from the orchestration layer: domain agent packs + context + the execution contract. Two judge vendors, neither neutral, both pointing the same direction.

## What I'm taking from this

The interesting result isn't "OrgX beat gpt-5-nano." A multi-agent system with domain skill packs beating a nano-class smoke baseline is the expected outcome — that baseline exists to prove the pipeline produces complete bundles, not to be a worthy opponent. The interesting results are upstream of the scoreboard:

1. Cross-provider verification is cheap. Three DeepSeek judges, 81 absolute judgments + 72 pairwise comparisons, about 41 cents total. There is no excuse for any agent benchmark to let one vendor grade itself. Ever.
2. Absolute rubrics saturate + pairwise discriminates. If your eval reports 100s, you're not measuring quality anymore, you're measuring presence. Report preference.
3. Running your own benchmark finds your own bugs. The quota outage exposed that our cloud runner turns one vendor's billing state into a platform-wide failure, that provider pinning wasn't honored end to end, and that failed runs were invisible to the status surfaces. All of it is written up in the public gap analysis — A1 through A7, B1 through B9 — with the receipts attached to the initiative in OrgX itself.

That last part is the whole philosophy. The benchmark exists to make trust auditable, and so when it catches OrgX being bad at something, that goes in the bundle too. Hidden failure modes are how agent platforms die quietly.

Next: re-run the OpenAI baseline at full coverage and 3 repeats once quota is back, add an Anthropic generation lane so we have a three-vendor matrix, and keep moving the headline metric from rubric scores to pairwise preference until Initiative Worlds lands with deterministic validators and hidden evaluator truth.

Repo's public. Bundles are in `results/`. Check the math yourself — that's the point.
