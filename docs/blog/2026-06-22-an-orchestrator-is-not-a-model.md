# An orchestrator is not a model: the benchmark contract agent systems need

A new orchestration model shipped today. Sakana's Fugu is a learned multi-agent
system — it decides, per turn, which expert model should think, work, or verify —
and it's served through a single OpenAI-compatible endpoint, so you call it exactly
like you'd call a model. That's a genuinely interesting piece of research, and it
makes one thing undeniable: orchestration is now a first-class primitive, not a
framework you bolt on.

So I want to use the moment to say something we've been building toward for months,
and then hold ourselves to it in public — including where it hurts.

## The category error

When an orchestration system is shaped like a model, the obvious thing to do is
drop it on a model leaderboard. Fugu vs Opus, Fugu Ultra vs the field. But that
comparison can't tell you the thing you actually need to know. A system that, on
each turn, can summon a coordinated team of frontier experts is spending a
different amount of compute than a single model answering once. If it wins, you
don't yet know *why*: better orchestration policy, or just more test-time compute
pointed at the problem?

That's not a knock on Fugu. It's a knock on the measurement. The release reports
benchmark scores, but not the resource envelope behind them — call counts,
orchestration tokens, retries, wall-clock, task cost, or which models actually
acted. Public pricing exists; the envelope behind the results does not. You can't
tell, from the outside, whether it's efficient or brute force. Neither can we —
which is exactly the point.

## The contract

So here's a neutral standard. It applies equally to Sakana, to OrgX, to
OpenRouter-style fusion, to provider-native agent modes, to whatever ships next.
A result is only legible if it carries:

- **Same system class.** Compare orchestrators to orchestrators, models to models —
  never full orchestration against a bare chat completion while calling both "models."
- **Same harness, matched budget.** Every arm gets the same task environment and the
  same aggregate token / dollar / wall-clock allowance. Otherwise a win reduces to
  "it sampled more intelligence."
- **Full envelope.** Input / cached / output / reasoning / orchestration tokens
  across *all* subagents, calls, retries, latency (p50/p95), and cost — provider
  cost and customer-billed cost separately.
- **Named arms.** Every model version-pinned, every provider disclosed. No "Model A/B/C."
- **Static vs adaptive ablations.** Show whether the gain is the orchestration policy
  or just more compute: best-of-N, self-reflection, and a fixed workflow at the same budget.
- **Losses and escalations.** Where the system lost, where it spent more without
  improving, where it correctly handed back to a human.
- **Auditable or clearly labeled.** Reproducible artifacts, or an honest label saying why not.

Reduce every claim to **outcome + budget + trace**. A quality number without its
resource envelope is not a result; it's a headline.

## We held ourselves to it first, and it cost us

Before pointing this standard at anyone, we ran it over our own published bundles.
It caught us.

One bundle recorded our OrgX generation surface at **zero tokens and zero cost** —
not because it was free, but because that surface never piped its telemetry. Sitting
next to a raw baseline that honestly reported ~$4 of generation, our work looked
free. That's precisely the non-equivalence this contract exists to forbid. Another
bundle's metadata claimed artifacts were scored by "independent OpenAI judge calls"
when the panel was in fact three DeepSeek models — a hardcoded string that had
propagated across more than ten bundles.

We fixed it at the source. Missing telemetry is now represented as `null` —
unknown, never `0`. Any bundle without complete coverage is flagged
`costComparable: false` and excluded from cross-bundle cost comparison. Claim
strings are generated from the actual run manifest, so a bundle can't say "OpenAI"
when it means "DeepSeek." The README and result index are generated from validated
manifests, not maintained by hand. If we're going to ask anyone for their envelope,
ours has to be real first.

## The thing the regime map already showed

Here's why I think this matters beyond bookkeeping. We've been running OrgX's own
orchestration against its base model on deterministic, state-checked worlds — same
model, same tools, the only variable is the loop. The result is a clean map:

Orchestration helps in exactly one regime — a model that's *almost* good enough on
a task it *almost* gets. On a strong model that already saturates the task,
reflexive "verify everything" orchestration is pure cost, and sometimes worse than
cost: in one run our own verification loop took a model that was right 8 out of 8
times and made it right 6 out of 8. The policy that's robust across the whole
ladder isn't "always orchestrate" — it's *verify on the edge*: spend the extra
cognition only where the uncertainty justifies it.

So we ran Fugu through it. Both tiers — `fugu` and `fugu-ultra` — across nine
deterministic worlds, recording the envelope Sakana's launch doesn't publish
([full numbers here](fugu-envelope-2026-06-22.md)). The result, for $2.30 of
spend: **Fugu Ultra's orchestration bought zero additional reliable passes over
base Fugu — at 45% orchestration overhead and ~2× the tokens.** On a trivial
"140 + 10," Ultra spent 900 of its 995 tokens on orchestration — ~90% overhead
for the identical answer. The one world where a quick k=3 pass *hinted* Ultra
recovered a hard sequential task turned out to be a pass@1-style illusion: at
k=8, base Fugu already solves it 8/8, and Ultra's coordination just adds 30%
overhead and $0.77 for no extra passes.

To Fugu's credit, Ultra *exposes* its orchestration tokens in the usage payload —
that's the runtime transparency we're asking for, and it's exactly what let us
compute this. (Regular `fugu` reports zero orchestration and bills at a hidden
route-dependent rate; neither tier says which models acted.) This isn't "Fugu is
bad" — it's the regime map on a real shipped orchestrator: on tasks a strong base
tier already handles, always-on orchestration is measured, exactly-priced
overhead. It would pay in the borderline band; our public worlds mostly aren't
calibrated there, and we say so. The point stands: "when does the extra cognition
pay?" is answerable only with the envelope, and only when you measure reliability
at k instead of trusting one lucky run.

## So we built the controls

To keep ourselves honest about "policy vs. just more sampling," we added the two
null arms the contract demands, at matched compute: **best-of-N** (draw N
independent samples, select by majority vote — never by peeking at the validator)
and **self-reflection** (one generic self-critique pass, no special machinery).
If a selective orchestration gate can't beat *sampling N times and voting* at the
same token budget, it isn't earning its keep, and we want the benchmark to say so.

We also started scoring the axes a black-box endpoint can't easily expose:
**provenance completeness** (field-based, so a competitor earns credit for whatever
its payload *does* reveal — the rubric isn't rigged), **recovery** (we inject a
transient provider outage and check whether the system recovers or fabricates), and
**budget adherence** (a system shouldn't get to win by silently overspending).

## What we still don't know

The honest part. Our headline split — private worlds with hidden state and timed
human baselines — isn't populated yet. Until it is, everything we publish is a
*mechanism and regime* measurement on public, contamination-visible worlds, not a
headline. We say that loudly because the alternative is the exact disease this whole
post is about: a confident number with no envelope behind it.

## The wedge

The model runtime is going to change every few weeks. Routers will commoditize.
What compounds is the layer underneath: the durable, replayable record of what your
organization decided, what it cost, which model acted, what was verified, and how it
recovered when the model layer shifted under it. Fugu is a backend. The interesting
question isn't which backend wins this month — it's who owns the trust and control
plane that makes backends interchangeable.

That's what we're building, and it's the standard we're going to be measured by too.
The bundles are public. The repair is in the history. Check the math — that's still
the point.
