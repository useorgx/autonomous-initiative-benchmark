#!/usr/bin/env python3
"""Select and pin a deterministic public AutomationBench cohort.

Run from a checkout of the exact upstream commit. Selection happens before any
model call and the output binds source order, task contracts, and the upstream
rubric's dynamic initial-state exclusion behavior.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

from automationbench.domains import PUBLIC_DOMAINS, get_domain_dataset
from automationbench.rubric.registry import AssertionRegistry
from automationbench.runner import strip_none_values
from automationbench.schema.world import WorldState
from automationbench.task_contract import TASK_CONTRACT_SCHEMA, task_contract_sha256

# Register every assertion handler before probing the initial states.
import automationbench.rubric.assertions  # noqa: F401,E402


def parse_info(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise TypeError("task info must be an object or encoded object")
    return value


def plain_message(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value


def rank(seed: str, domain: str, name: str) -> str:
    return hashlib.sha256(f"{seed}\0{domain}\0{name}".encode()).hexdigest()


def task_name(row: dict[str, Any], domain: str) -> str:
    name = parse_info(row["info"]).get("task_name")
    if not isinstance(name, str) or not name:
        raise ValueError(f"every task in {domain} must have a stable info.task_name")
    return name


def exclusion_policy(info: dict[str, Any]) -> dict[str, list[int]]:
    assertions = [strip_none_values(assertion) for assertion in info.get("assertions", [])]
    initial = WorldState(**strip_none_values(info.get("initial_state", {})))
    explicit: list[int] = []
    initially_passing: list[int] = []
    force_scored: list[int] = []
    for index, assertion in enumerate(assertions):
        if assertion.get("scored") is False or assertion.get("excluded") is True:
            explicit.append(index)
        if assertion.get("excluded") is False:
            force_scored.append(index)
        if bool(AssertionRegistry.check(initial, assertion)):
            initially_passing.append(index)
    return {
        "explicit_excluded_indices": explicit,
        "initially_passing_indices": initially_passing,
        "force_scored_indices": force_scored,
    }


def git_head() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True
    )
    return result.stdout.strip().lower()


def build_cohort(
    *,
    seed: str,
    per_domain: int | None,
    role: str,
    expected_upstream_commit: str,
    expected_benchmark_version: str,
) -> dict[str, Any]:
    if per_domain is not None and per_domain < 1:
        raise ValueError("per_domain must be positive")
    upstream_commit = git_head()
    if upstream_commit != expected_upstream_commit:
        raise ValueError(
            f"AutomationBench checkout drift: expected {expected_upstream_commit}, got {upstream_commit}"
        )

    rows: list[dict[str, Any]] = []
    source_counts: dict[str, int] = {}
    global_index = 0
    for domain in PUBLIC_DOMAINS:
        domain_dataset = get_domain_dataset(domain)
        source_counts[domain] = len(domain_dataset)
        local_names: list[str] = []
        for row in domain_dataset:
            plain = dict(row)
            name = task_name(plain, domain)
            local_names.append(name)
            rows.append({
                "domain": domain,
                "global_index": global_index,
                "row": plain,
                "name": name,
                "selection_rank_sha256": rank(seed, domain, name),
            })
            global_index += 1
        if len(set(local_names)) != len(local_names):
            raise ValueError(f"duplicate task_name within {domain}")

    selected_indices: set[int] = set()
    selection_details: dict[str, list[dict[str, str]]] = {}
    for domain in PUBLIC_DOMAINS:
        candidates = sorted(
            (candidate for candidate in rows if candidate["domain"] == domain),
            key=lambda candidate: (candidate["selection_rank_sha256"], candidate["name"]),
        )
        picked = candidates if per_domain is None else candidates[:per_domain]
        if per_domain is not None and len(picked) != per_domain:
            raise ValueError(f"{domain} has only {len(picked)} tasks; requested {per_domain}")
        selected_indices.update(candidate["global_index"] for candidate in picked)
        selection_details[domain] = [
            {
                "name": candidate["name"],
                "selection_rank_sha256": candidate["selection_rank_sha256"],
            }
            for candidate in picked
        ]

    # AutomationBench filters the concatenated public dataset by task name while
    # preserving source order; verifiers assigns example_id in that filtered order.
    selected = [candidate for candidate in rows if candidate["global_index"] in selected_indices]
    names = [candidate["name"] for candidate in selected]
    if len(names) != len(set(names)):
        raise ValueError("task names must be globally unique in a comparison cohort")

    tasks: list[dict[str, Any]] = []
    for example_id, candidate in enumerate(selected):
        row = candidate["row"]
        info = parse_info(row["info"])
        assertions = info.get("assertions")
        prompt = row.get("prompt")
        if not isinstance(assertions, list) or not assertions:
            raise ValueError(f"{candidate['name']} has no assertions")
        if not isinstance(prompt, list) or not prompt:
            raise ValueError(f"{candidate['name']} has no prompt messages")
        tasks.append({
            "name": candidate["name"],
            "domain": candidate["domain"],
            "source_index": candidate["global_index"],
            "evaluation_example_id": example_id,
            "contract_schema": TASK_CONTRACT_SCHEMA,
            "contract_sha256": task_contract_sha256(
                example_id=example_id,
                prompt=[plain_message(message) for message in prompt],
                info=info,
            ),
            "assertions_total": len(assertions),
            "exclusion_policy": exclusion_policy(info),
        })

    canonical_tasks = json.dumps(tasks, sort_keys=True, separators=(",", ":"))
    return {
        "schema": "orgx.automationbench-cohort/v1",
        "upstream_commit": upstream_commit,
        "benchmark_version": expected_benchmark_version,
        "split": "public",
        "cohort_role": role,
        "selection_seed": seed,
        "selection": {
            "method": "sha256_rank_within_domain_then_source_order",
            "seed": seed,
            "per_domain": per_domain,
            "public_domains": list(PUBLIC_DOMAINS),
        },
        "source_counts": source_counts,
        "task_count": len(tasks),
        "tasks_csv": ",".join(task["name"] for task in tasks),
        "cohort_sha256": hashlib.sha256(canonical_tasks.encode()).hexdigest(),
        "tasks": tasks,
        "selection_details": selection_details,
        "note": "Development cohorts are integration instruments, not publishable model-performance samples.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", required=True)
    parser.add_argument("--expected-upstream-commit", required=True)
    parser.add_argument("--expected-benchmark-version", default="1.0.6")
    parser.add_argument("--per-domain", type=int, default=10)
    parser.add_argument("--all-public", action="store_true")
    parser.add_argument(
        "--cohort-role",
        choices=["development_microcanary", "development_pilot", "public_full"],
        required=True,
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    expected_commit = args.expected_upstream_commit.strip().lower()
    if len(expected_commit) != 40 or any(ch not in "0123456789abcdef" for ch in expected_commit):
        parser.error("--expected-upstream-commit must be a full lowercase hexadecimal SHA")
    cohort = build_cohort(
        seed=args.seed,
        per_domain=None if args.all_public else args.per_domain,
        role=args.cohort_role,
        expected_upstream_commit=expected_commit,
        expected_benchmark_version=args.expected_benchmark_version,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(cohort, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "output": str(args.output),
        "task_count": cohort["task_count"],
        "cohort_sha256": cohort["cohort_sha256"],
    }))


if __name__ == "__main__":
    main()
