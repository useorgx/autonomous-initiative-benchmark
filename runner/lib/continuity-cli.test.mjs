import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(
  new URL("../continuity-benchmark.mjs", import.meta.url)
);
test("CLI preserves full frozen denominator when credit preflight blocks all dispatch", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "continuity-cli-"));
  try {
    const mock = path.join(dir, "fetch.mjs");
    writeFileSync(
      mock,
      `globalThis.fetch=async url=>{if(url.endsWith('/models'))return {ok:true,json:async()=>({data:[{id:'test/model',context_length:8192,pricing:{prompt:'0.000001',completion:'0.000001'},supported_parameters:['tools']}]})};if(url.endsWith('/credits'))return {ok:true,json:async()=>({data:{total_credits:1,total_usage:2}})};throw new Error('Unexpected network dispatch');};`
    );
    const env = {
      ...process.env,
      OPENROUTER_API_KEY: "test",
      BENCHMARK_COMMIT: "a".repeat(40),
    };
    const run = (args) =>
      spawnSync(process.execPath, ["--import", mock, runner, ...args], {
        env,
        encoding: "utf8",
      });
    const frozen = path.join(dir, "frozen"),
      out = path.join(dir, "run");
    const freeze = run([
      "freeze",
      "--models",
      "test/model",
      "--seeds",
      "11",
      "--out",
      frozen,
    ]);
    assert.equal(freeze.status, 0, freeze.stderr);
    const componentFreeze = run([
      "freeze",
      "--models",
      "test/model",
      "--seeds",
      "11",
      "--component-arm",
      "true",
      "--out",
      path.join(dir, "component"),
    ]);
    assert.equal(componentFreeze.status, 0, componentFreeze.stderr);
    const missingAdapter = run([
      "run",
      "--frozen",
      path.join(dir, "component"),
      "--out",
      path.join(dir, "missing-adapter"),
    ]);
    assert.equal(missingAdapter.status, 1, missingAdapter.stderr);
    const blockedReport = JSON.parse(
      readFileSync(path.join(dir, "missing-adapter", "report.json"))
    );
    assert.match(blockedReport.preflight_error, /requires its runtime adapter/);
    assert.equal(blockedReport.budget.observed_usd, 0);
    const result = run(["run", "--frozen", frozen, "--out", out]);
    assert.equal(result.status, 1, result.stderr);
    const ledger = JSON.parse(readFileSync(path.join(out, "ledger.json")));
    assert.equal(ledger.episodes.length, 18);
    assert.ok(
      ledger.episodes.every(
        (e) => e.status === "blocked" && e.calls.length === 0
      )
    );
    assert.equal(ledger.budget.observed_usd, 0);
    const report = run([
      "report",
      "--plan",
      path.join(out, "plan.json"),
      "--ledger",
      path.join(out, "ledger.json"),
      "--out",
      path.join(dir, "report.json"),
    ]);
    assert.equal(report.status, 0, report.stderr);
    assert.equal(
      JSON.parse(readFileSync(path.join(dir, "report.json"))).integrity_audit
        .ok,
      true
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
