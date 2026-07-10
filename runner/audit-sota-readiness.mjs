#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateSotaReadiness } from './lib/sota-readiness.mjs';
import {
  collectReplicationRowsFromEvidenceDocument,
  collectReplicationRowsFromMetadata,
  summarizeReplicationRows,
} from './lib/replication-evidence.mjs';
import { validateStrangerReproductionReceipt } from './lib/stranger-reproduction.mjs';
import {
  validateContaminationAudit,
  validateCorrectionLedger,
  validateStatisticalPrecisionReport,
  validateWorldQualityAudit,
} from './lib/benchmark-quality-evidence.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));
const orgxRoot = args.orgxRoot ?? path.resolve(process.env.HOME ?? '/Users/hopeatina', 'Code', 'orgx');

if (isMain()) {
  const report = await buildSotaReadinessReport({ repoRoot, orgxRoot });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok || args.allowIncomplete ? 0 : 1);
}

export async function buildSotaReadinessReport({ repoRoot, orgxRoot = null } = {}) {
  const [
    packageJson,
    registry,
    artifacts,
    providerKeys,
    validatorTypes,
    futureModelDrills,
    humanBaselineSummary,
    orgxEvidence,
    headlineBundleCount,
    externallyReplicatedRows,
    strangerReproduction,
  ] = await Promise.all([
    readJson(path.join(repoRoot, 'package.json'), {}),
    readJson(path.join(repoRoot, 'worlds', 'corpus-splits.json'), {}),
    collectArtifactPresence(repoRoot),
    collectProviderKeys(repoRoot),
    collectValidatorTypes(repoRoot),
    collectFutureModelDrills(repoRoot),
    readJson(path.join(repoRoot, 'results', 'human-baseline-summary.json'), null),
    collectOrgxEvidence(orgxRoot),
    countHeadlineBundles(repoRoot),
    countExternallyReplicatedRows(repoRoot),
    collectStrangerReproductionEvidence(repoRoot),
  ]);

  const resolvedOrgxRoot = orgxEvidence.root ?? orgxRoot;
  const benchmarkQualityEvidence = await collectBenchmarkQualityEvidence(repoRoot, registry);
  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    orgxRoot: resolvedOrgxRoot,
    ...evaluateSotaReadiness({
      artifacts,
      registry,
      packageJson,
      providerKeys,
      validatorTypes,
      futureModelDrills,
      humanBaselineSummary,
      orgxEvidence,
      headlineBundleCount,
      externallyReplicatedRows,
      strangerReproduction,
      benchmarkQualityEvidence,
    }),
  };
}

async function collectArtifactPresence(root) {
  const required = [
    'docs/orgx-bench-v1-contract.md',
    'docs/strategy/sota-undeniable-plan-2026-07-08.md',
    'docs/strategy/benchmark-v1.2-defensibility-plan-2026-07-09.md',
    'runner/lib/prompt-audit.mjs',
    'runner/lib/dimension-independence.mjs',
    'runner/lib/validate-bundle-contract.test.mjs',
    'runner/lib/run-manifest.mjs',
    'runner/lib/run-manifest.test.mjs',
    'results/benchmark-run-manifest.example.json',
    'results/sota-release-manifest.example.json',
    'schemas/evaluation-manifest.schema.json',
    'schemas/model-manifest.schema.json',
    'schemas/benchmark-run-manifest.schema.json',
    'schemas/human-baseline-plan.schema.json',
    'schemas/human-expert-roster.schema.json',
    'schemas/human-baseline-session-packets.schema.json',
    'schemas/human-baseline-session-kits.schema.json',
    'schemas/sota-release-manifest.schema.json',
    'schemas/sota-sweep-plan.schema.json',
    'schemas/sota-execution-ledger.schema.json',
    'schemas/third-party-replication-evidence.schema.json',
    'schemas/stranger-reproduction-receipt.schema.json',
    'schemas/outreach-target-plan.schema.json',
    'schemas/outreach-action-ledger.schema.json',
    'schemas/private-validator-bundle.schema.json',
    'schemas/initiative-world.schema.json',
    'schemas/world-quality-audit.schema.json',
    'schemas/contamination-audit.schema.json',
    'schemas/statistical-precision-report.schema.json',
    'schemas/benchmark-correction-ledger.schema.json',
    'runner/lib/benchmark-quality-evidence.mjs',
    'runner/lib/benchmark-quality-evidence.test.mjs',
  ];
  const entries = {};
  await Promise.all(
    required.map(async (file) => {
      entries[file] = await exists(path.join(root, file));
    })
  );
  return entries;
}

async function collectBenchmarkQualityEvidence(root, registry) {
  const manifest = await readJson(path.join(root, 'results', 'sota-release-manifest.example.json'), {});
  const expectedWorldIds = (registry?.splits?.private_holdout?.worlds ?? []).map((world) => world.worldId).filter(Boolean);
  const collect = async (pathField, validator, options = {}) => {
    const evidencePath = manifest?.evidence?.[pathField];
    if (!evidencePath) return { exists: false, path: null, validation: null };
    const document = await readJson(path.join(root, evidencePath), null);
    if (!document) return { exists: false, path: evidencePath, validation: null };
    return { exists: true, path: evidencePath, validation: validator(document, options) };
  };
  return {
    worldQuality: await collect('worldQualityAuditPath', validateWorldQualityAudit, { expectedWorldIds }),
    contamination: await collect('contaminationAuditPath', validateContaminationAudit, { expectedWorldIds }),
    statisticalPrecision: await collect('statisticalPrecisionReportPath', validateStatisticalPrecisionReport),
    correctionLedger: await collect('correctionLedgerPath', validateCorrectionLedger, { releaseId: manifest.releaseId }),
  };
}

async function collectProviderKeys(root) {
  try {
    const module = await import(pathToFileURL(path.join(root, 'runner', 'lib', 'providers.mjs')).href);
    return Object.keys(module.PROVIDERS ?? {}).sort();
  } catch {
    return [];
  }
}

async function collectValidatorTypes(root) {
  const schema = await readJson(path.join(root, 'schemas', 'private-validator-bundle.schema.json'), {});
  return (
    schema?.properties?.validators?.items?.properties?.type?.enum ??
    []
  ).sort();
}

async function collectFutureModelDrills(root) {
  const resultsDir = path.join(root, 'results');
  let files = [];
  try {
    files = await readdir(resultsDir);
  } catch {
    return [];
  }
  const drillFiles = files
    .filter((file) => /^future-model-fire-drill-.*\.json$/.test(file))
    .sort();
  const drills = [];
  for (const file of drillFiles) {
    const drill = await readJson(path.join(resultsDir, file), null);
    if (drill) drills.push({ file: path.join('results', file), ...drill });
  }
  return drills;
}

async function collectOrgxEvidence(root) {
  const appRoot = await resolveOrgxAppRoot(root);
  if (!appRoot) {
    return { exists: false };
  }

  const files = await readCandidateOrgxFiles(appRoot);
  const haystack = files.map((file) => file.text).join('\n');
  return {
    exists: true,
    root: appRoot,
    filesRead: files.map((file) => path.relative(appRoot, file.path)).sort(),
    pinningViolation: /\bpinning_violated\b/.test(haystack),
    pinningChaosTest: /\bexpect\([^)]*(?:resultKind|skipReason)[^)]*\)\.toBe\('pinning_violated'\)/.test(haystack),
    benchmarkPinnedProvider: /\bbenchmarkPinnedProvider\b/.test(haystack),
    manifestIds:
      /\bmodelManifestId\b/.test(haystack) &&
      /\brunManifestId\b/.test(haystack) &&
      /\blossRegistryId\b/.test(haystack),
    labPublishabilityReason: /\bpublishabilityReason\b|\bpublicationLabel\b|\bdo-not-publish\b/.test(haystack),
    submissionApi:
      /\bsealed\b/i.test(haystack) &&
      /\bsubmission\b/i.test(haystack) &&
      /\bvalidator\b/i.test(haystack),
    leakAudit: /\bleak(?:age)? audit\b|\binformation-leak\b|\bcanary anomaly\b/i.test(haystack),
  };
}

async function resolveOrgxAppRoot(root) {
  if (!root) return null;
  const candidates = [root, path.join(root, 'orgx')];
  for (const candidate of candidates) {
    if ((await exists(path.join(candidate, 'package.json'))) || (await exists(path.join(candidate, 'AGENTS.md')))) {
      return candidate;
    }
  }
  return (await exists(root)) ? root : null;
}

async function readCandidateOrgxFiles(root) {
  const candidates = [
    'lib/evals/benchmark/runtimeConfig.ts',
    'lib/evals/benchmark/sealedSubmission.ts',
    'executors/orgxPlatform.ts',
    'lib/server/executionRouting.ts',
    'lib/agents/providerDispatcher.ts',
    'lib/server/consoleWorker/credentialSource.ts',
    'lib/evals/publication/gatingCheck.ts',
    'lib/evals/publication/buildPublicBundle.ts',
    'app/api/evals/benchmark/submissions/route.ts',
    'app/api/evals/benchmark/submit/route.ts',
    'app/evals/benchmark/runs/[runId]/page.tsx',
    'tests/evals/sealedSubmission.spec.ts',
    'tests/api.benchmark-sealed-submissions.route.spec.ts',
    'tests/evals/orgxPlatformBenchmark.spec.ts',
    'tests/executionRouting.spec.ts',
    'tests/evals/runtimeConfig.spec.ts',
    'tests/evals/benchmarkGating.spec.ts',
  ];
  const files = [];
  for (const relative of candidates) {
    const filePath = path.join(root, relative);
    if (!(await exists(filePath))) continue;
    files.push({ path: filePath, text: await readFile(filePath, 'utf8') });
  }
  return files;
}

async function countHeadlineBundles(root) {
  const resultsDir = path.join(root, 'results');
  let entries = [];
  try {
    entries = await readdir(resultsDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadata = await readJson(path.join(resultsDir, entry.name, 'metadata.json'), null);
    if (
      metadata?.publicationLabel === 'headline' &&
      metadata?.costComparable !== false &&
      metadata?.accountingComparable !== false &&
      Array.isArray(metadata?.lossRegistry) &&
      metadata?.modelManifest?.models?.length > 0
    ) {
      count += 1;
    }
  }
  return count;
}

async function countExternallyReplicatedRows(root) {
  const resultsDir = path.join(root, 'results');
  let entries = [];
  try {
    entries = await readdir(resultsDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  const rows = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metadata = await readJson(path.join(resultsDir, entry.name, 'metadata.json'), null);
      rows.push(...collectReplicationRowsFromMetadata(metadata));
    } else if (/^(third-party-replication|replication-evidence).*\.json$/.test(entry.name)) {
      const document = await readJson(path.join(resultsDir, entry.name), null);
      rows.push(...collectReplicationRowsFromEvidenceDocument(document));
    }
  }
  return summarizeReplicationRows(rows).validRows;
}

async function collectStrangerReproductionEvidence(root) {
  const manifestPath = path.join(root, 'results', 'sota-release-manifest.example.json');
  const manifest = await readJson(manifestPath, null);
  const receiptPath = manifest?.evidence?.strangerReproductionReceiptPath;
  if (!receiptPath) {
    return { exists: false, strictErrors: ['strangerReproductionReceiptPath is not set'] };
  }

  const resolvedReceiptPath = path.join(root, receiptPath);
  const receipt = await readJson(resolvedReceiptPath, null);
  if (!receipt) {
    return {
      exists: false,
      path: receiptPath,
      strictErrors: ['stranger reproduction receipt is missing or invalid JSON'],
    };
  }

  return {
    exists: true,
    path: receiptPath,
    validation: validateStrangerReproductionReceipt(receipt, { strict: false }),
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const parsed = { allowIncomplete: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-incomplete') parsed.allowIncomplete = true;
    else if (arg === '--orgx-root') parsed.orgxRoot = argv[++index];
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
