#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  collectReplicationRowsFromEvidenceDocument,
  collectReplicationRowsFromMetadata,
  validateReplicationEvidenceDocument,
} from './lib/replication-evidence.mjs';
import { validateHumanBaselinePlan } from './lib/human-baseline-plan.mjs';
import { validateSotaExecutionLedger } from './lib/sota-execution-ledger.mjs';
import { sha256File, validateSotaReleaseManifest } from './lib/sota-release.mjs';
import { buildSotaSweepPlan } from './lib/sota-sweep-plan.mjs';
import { validateStrangerReproductionReceipt } from './lib/stranger-reproduction.mjs';
import {
  validateContaminationAudit,
  validateCorrectionLedger,
  validateStatisticalPrecisionReport,
  validateWorldQualityAudit,
} from './lib/benchmark-quality-evidence.mjs';
import { validateBundleDirectory } from './validate-bundle.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(repoRoot, args.manifest ?? 'results/sota-release-manifest.example.json');
  const manifest = await readJson(manifestPath, null);
  if (!manifest) {
    console.error(`Missing or invalid SOTA release manifest: ${path.relative(repoRoot, manifestPath)}`);
    process.exit(2);
  }

  const evidence = await collectReleaseEvidence({ manifest, repoRoot });
  const result = validateSotaReleaseManifest(manifest, evidence, { strict: args.strict });
  console.log(
    JSON.stringify(
      {
        manifest: path.relative(repoRoot, manifestPath),
        ...result,
      },
      null,
      2
    )
  );
  process.exit(result.ok ? 0 : 1);
}

export async function collectReleaseEvidence({ manifest, repoRoot }) {
  const registry = await readJson(path.join(repoRoot, manifest.evidence?.registryPath ?? 'worlds/corpus-splits.json'), null);
  const humanBaselineSummary = await readJson(
    path.join(repoRoot, manifest.evidence?.humanBaselineSummaryPath ?? 'results/human-baseline-summary.json'),
    null
  );
  const protocolHash = manifest.preregistration?.protocolPath
    ? await readHashIfExists(path.join(repoRoot, manifest.preregistration.protocolPath))
    : null;

  const headlineBundle = await collectHeadlineBundleEvidence({ manifest, repoRoot });
  const replicationEvidence = await collectReplicationEvidence({ manifest, repoRoot });
  const replicationRows = [
    ...(headlineBundle?.metadata ? collectReplicationRowsFromMetadata(headlineBundle.metadata) : []),
    ...(replicationEvidence?.rows ?? []),
  ];
  const humanBaselinePlan = await collectHumanBaselinePlanEvidence({ manifest, repoRoot });
  const executionLedger = await collectExecutionLedgerEvidence({ manifest, registry, repoRoot });
  const strangerReproduction = await collectStrangerReproductionEvidence({ manifest, repoRoot });
  const expectedWorldIds = (registry?.splits?.private_holdout?.worlds ?? []).map((world) => world.worldId).filter(Boolean);
  const worldQuality = await collectQualityEvidence({
    manifest,
    repoRoot,
    pathField: 'worldQualityAuditPath',
    validator: validateWorldQualityAudit,
    options: { strict: false, expectedWorldIds },
  });
  const contamination = await collectQualityEvidence({
    manifest,
    repoRoot,
    pathField: 'contaminationAuditPath',
    validator: validateContaminationAudit,
    options: { strict: false, expectedWorldIds },
  });
  const statisticalPrecision = await collectQualityEvidence({
    manifest,
    repoRoot,
    pathField: 'statisticalPrecisionReportPath',
    validator: validateStatisticalPrecisionReport,
    options: { strict: false },
  });
  const correctionLedger = await collectQualityEvidence({
    manifest,
    repoRoot,
    pathField: 'correctionLedgerPath',
    validator: validateCorrectionLedger,
    options: { strict: false, releaseId: manifest.releaseId },
  });

  return {
    registry,
    humanBaselineSummary,
    humanBaselinePlan,
    protocolHash,
    executionLedger,
    headlineBundle,
    replicationEvidence,
    replicationRows,
    strangerReproduction,
    worldQuality,
    contamination,
    statisticalPrecision,
    correctionLedger,
  };
}

async function collectQualityEvidence({ manifest, repoRoot, pathField, validator, options }) {
  const evidencePath = manifest.evidence?.[pathField];
  if (!evidencePath) return { exists: false, strictErrors: [`${pathField} is not set`] };
  const document = await readJson(path.join(repoRoot, evidencePath), null);
  if (!document) return { exists: false, path: evidencePath, strictErrors: [`${pathField} is missing or invalid JSON`] };
  return {
    exists: true,
    path: evidencePath,
    validation: validator(document, options),
  };
}

async function collectHumanBaselinePlanEvidence({ manifest, repoRoot }) {
  const planPath = manifest.evidence?.humanBaselinePlanPath;
  if (!planPath) {
    return { exists: false, strictErrors: ['humanBaselinePlanPath is not set'] };
  }

  try {
    const plan = await readJson(path.join(repoRoot, planPath), null);
    if (!plan) {
      return { exists: false, path: planPath, strictErrors: ['human baseline plan is missing or invalid JSON'] };
    }
    return {
      exists: true,
      path: planPath,
      validation: validateHumanBaselinePlan(plan, { strict: false }),
    };
  } catch (error) {
    return {
      exists: false,
      path: planPath,
      strictErrors: [error.message],
    };
  }
}

async function collectExecutionLedgerEvidence({ manifest, registry, repoRoot }) {
  const ledgerPath = manifest.evidence?.executionLedgerPath;
  if (!ledgerPath) {
    return { exists: false, strictErrors: ['executionLedgerPath is not set'] };
  }

  try {
    const ledger = await readJson(path.join(repoRoot, ledgerPath), null);
    if (!ledger) {
      return { exists: false, path: ledgerPath, strictErrors: ['execution ledger is missing or invalid JSON'] };
    }
    const plan = buildSotaSweepPlan({ releaseManifest: manifest, registry, includeJobs: true });
    return {
      exists: true,
      path: ledgerPath,
      validation: validateSotaExecutionLedger({ ledger, plan, strict: false }),
    };
  } catch (error) {
    return {
      exists: false,
      path: ledgerPath,
      strictErrors: [error.message],
    };
  }
}

async function collectHeadlineBundleEvidence({ manifest, repoRoot }) {
  const bundlePath = manifest.evidence?.headlineBundlePath;
  if (!bundlePath) {
    return { exists: false, strictErrors: ['headlineBundlePath is not set'] };
  }

  try {
    const result = await validateBundleDirectory(bundlePath, { strict: true, cwd: repoRoot });
    return {
      exists: true,
      path: bundlePath,
      publicationLabel: result.metadata.publicationLabel ?? result.metadata.publication?.label ?? null,
      benchmarkWeek: result.summary.benchmarkWeek,
      strictErrors: result.issues.errors,
      strictWarnings: result.issues.warnings,
      metadata: result.metadata,
    };
  } catch (error) {
    return {
      exists: false,
      path: bundlePath,
      strictErrors: [error.message],
    };
  }
}

async function collectReplicationEvidence({ manifest, repoRoot }) {
  const evidencePath = manifest.evidence?.externalReplicationEvidencePath;
  if (!evidencePath) {
    return { exists: false, rows: [], strictErrors: [] };
  }

  try {
    const document = await readJson(path.join(repoRoot, evidencePath), null);
    if (!document) {
      return {
        exists: false,
        path: evidencePath,
        rows: [],
        strictErrors: ['external replication evidence is missing or invalid JSON'],
      };
    }
    return {
      exists: true,
      path: evidencePath,
      rows: collectReplicationRowsFromEvidenceDocument(document),
      validation: validateReplicationEvidenceDocument(document, { strict: false }),
    };
  } catch (error) {
    return {
      exists: false,
      path: evidencePath,
      rows: [],
      strictErrors: [error.message],
    };
  }
}

async function collectStrangerReproductionEvidence({ manifest, repoRoot }) {
  const receiptPath = manifest.evidence?.strangerReproductionReceiptPath;
  if (!receiptPath) {
    return { exists: false, strictErrors: ['strangerReproductionReceiptPath is not set'] };
  }

  try {
    const receipt = await readJson(path.join(repoRoot, receiptPath), null);
    if (!receipt) {
      return { exists: false, path: receiptPath, strictErrors: ['stranger reproduction receipt is missing or invalid JSON'] };
    }
    return {
      exists: true,
      path: receiptPath,
      validation: validateStrangerReproductionReceipt(receipt, { strict: false }),
    };
  } catch (error) {
    return {
      exists: false,
      path: receiptPath,
      strictErrors: [error.message],
    };
  }
}

async function readHashIfExists(filePath) {
  try {
    return await sha256File(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const parsed = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') parsed.strict = true;
    else if (arg === '--manifest') parsed.manifest = argv[++index];
    else if (!parsed.manifest) parsed.manifest = arg;
  }
  return parsed;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
