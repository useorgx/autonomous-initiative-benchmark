#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));

if (args.registry) {
  const result = await validateRegistry(args.registry, args.split ?? 'initiative_worlds_preview');
  print(result);
  process.exit(result.ok ? 0 : 1);
}

if (!args.worldDir || !args.receipt) {
  console.error('Usage: node runner/validate-world.mjs <world-dir> --receipt <receipt.json>');
  console.error('   or: node runner/validate-world.mjs --registry worlds/corpus-splits.json --split initiative_worlds_preview');
  process.exit(1);
}

const result = await validateWorld({
  worldDir: path.resolve(process.cwd(), args.worldDir),
  receiptPath: path.resolve(process.cwd(), args.receipt),
});
print(result);
process.exit(result.ok ? 0 : 1);

async function validateRegistry(registryPath, splitName) {
  const registryFile = path.resolve(process.cwd(), registryPath);
  const registry = JSON.parse(await readFile(registryFile, 'utf8'));
  const split = registry.splits?.[splitName];
  if (!split) {
    return {
      ok: false,
      split: splitName,
      errors: [`Split ${splitName} was not found in ${registryPath}.`],
    };
  }

  const worlds = split.worlds ?? [];
  const runnable = worlds.filter((world) => world.worldPath && world.oracleReceipt);
  const results = [];
  for (const world of runnable) {
    results.push(
      await validateWorld({
        worldDir: path.resolve(repoRoot, world.worldPath),
        receiptPath: path.resolve(repoRoot, world.oracleReceipt),
      })
    );
  }

  return {
    ok: results.every((item) => item.ok),
    split: splitName,
    totalWorlds: worlds.length,
    runnableWorlds: runnable.length,
    skippedWorlds: worlds.length - runnable.length,
    results,
  };
}

async function validateWorld({ worldDir, receiptPath }) {
  const world = parseSimpleYaml(await readFile(path.join(worldDir, 'world.yaml'), 'utf8'));
  const evaluatorPath = path.join(worldDir, 'private', 'evaluator.yaml');
  const evaluator = parseSimpleYaml(await readFile(evaluatorPath, 'utf8'));
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const warnings = [];
  const shapeErrors = validateWorldShape(world, evaluator, receipt);
  const validators = evaluator.validators ?? [];
  const results = [];

  for (const validator of validators) {
    results.push(await runValidator({ worldDir, receipt, validator }));
  }

  const totalWeight = sum(validators.map((validator) => validator.weight));
  const passedWeight = sum(results.filter((result) => result.passed).map((result) => result.weight));
  const deterministicWeight = sum(validators.filter((validator) => validator.deterministic).map((validator) => validator.weight));
  const deterministicScoreShare = totalWeight ? round(deterministicWeight / totalWeight, 4) : 0;
  const hardFailFlags = unique(results.filter((result) => !result.passed && result.hardFailFlag).map((result) => result.hardFailFlag));
  const criticalFailures = results.filter((result) => !result.passed && result.critical);
  const dimensions = buildDimensionScores(results);

  const minimumDeterministicShare = Number(world.holdoutEligibility?.minimumDeterministicScoreShare ?? 0.7);
  if (deterministicScoreShare < minimumDeterministicShare) {
    warnings.push(
      `deterministic validator share ${deterministicScoreShare} is below holdout threshold ${minimumDeterministicShare}`
    );
  }
  if (world.split === 'private_holdout' && Number(world.holdoutEligibility?.requiresHumanBaselines ?? 0) < 3) {
    warnings.push('private holdout worlds should require at least 3 human baselines');
  }
  if (evaluator.evaluatorIsolation?.agentCanRead !== false) {
    shapeErrors.push('evaluatorIsolation.agentCanRead must be false');
  }
  if (evaluator.evaluatorIsolation?.referenceAnswersOffPath !== true) {
    shapeErrors.push('evaluatorIsolation.referenceAnswersOffPath must be true');
  }

  return {
    ok: shapeErrors.length === 0 && criticalFailures.length === 0,
    worldId: world.worldId,
    title: world.title,
    split: world.split,
    status: world.status,
    score: round(totalWeight ? passedWeight / totalWeight : 0, 4),
    worldSuccess: criticalFailures.length === 0 ? 1 : 0,
    trustAdjustedScore: round(applyTrustPenalty(dimensions, hardFailFlags), 4),
    deterministicScoreShare,
    dimensions,
    hardFailFlags,
    passed: results.filter((result) => result.passed).map((result) => result.id),
    failed: results.filter((result) => !result.passed).map((result) => ({
      id: result.id,
      message: result.message,
      hardFailFlag: result.hardFailFlag ?? null,
    })),
    warnings,
    errors: shapeErrors,
  };
}

async function runValidator({ worldDir, receipt, validator }) {
  const base = {
    id: validator.id,
    type: validator.type,
    dimension: validator.dimension,
    weight: Number(validator.weight ?? 1),
    critical: Boolean(validator.critical),
    deterministic: Boolean(validator.deterministic),
    hardFailFlag: validator.hardFailFlag,
  };

  try {
    if (validator.type === 'json_path_equals') {
      const actual = getPath(receipt, validator.path);
      return passOrFail(base, deepEqual(actual, validator.expected), `${validator.path} expected ${format(validator.expected)} but found ${format(actual)}`);
    }

    if (validator.type === 'json_path_not_equals') {
      const actual = getPath(receipt, validator.path);
      return passOrFail(base, !deepEqual(actual, validator.expected), `${validator.path} must not equal ${format(validator.expected)}`);
    }

    if (validator.type === 'json_path_includes') {
      const actual = getPath(receipt, validator.path);
      return passOrFail(base, includesValue(actual, validator.expected), `${validator.path} did not include ${format(validator.expected)}`);
    }

    if (validator.type === 'citation_resolver') {
      const allowedSources = await loadAllowedSources(worldDir, validator);
      const citations = (receipt.artifacts ?? []).flatMap((artifact) => artifact.citations ?? []);
      const unknown = citations.filter((citation) => !allowedSources.includes(citation));
      const missing = (validator.requiredCitations ?? []).filter((citation) => !citations.includes(citation));
      const passed = unknown.length === 0 && missing.length === 0;
      return passOrFail(
        base,
        passed,
        `citation check failed; unknown=${unknown.join(',') || 'none'} missing=${missing.join(',') || 'none'}`
      );
    }

    if (validator.type === 'event_order') {
      const events = getPath(receipt, validator.path) ?? [];
      const actions = events.map((event) => event.action);
      const beforeIndex = actions.indexOf(validator.before);
      const afterIndex = actions.indexOf(validator.after);
      return passOrFail(
        base,
        beforeIndex !== -1 && afterIndex !== -1 && beforeIndex < afterIndex,
        `${validator.before} must occur before ${validator.after}`
      );
    }

    if (validator.type === 'file_exists') {
      await access(path.join(worldDir, validator.path));
      return passOrFail(base, true, '');
    }

    return passOrFail(base, false, `unsupported validator type ${validator.type}`);
  } catch (error) {
    return passOrFail(base, false, error instanceof Error ? error.message : String(error));
  }
}

async function loadAllowedSources(worldDir, validator) {
  if (Array.isArray(validator.allowedSources)) return validator.allowedSources;
  if (!validator.allowedSourcesPath) return [];
  const file = path.join(worldDir, validator.allowedSourcesPath);
  const source = JSON.parse(await readFile(file, 'utf8'));
  const allowed = getPath(source, validator.allowedSourcesJsonPath);
  return Array.isArray(allowed) ? allowed : [];
}

function validateWorldShape(world, evaluator, receipt) {
  const errors = [];
  for (const field of ['worldId', 'version', 'title', 'split', 'domainMix', 'goal', 'visibleState', 'constraints']) {
    if (world[field] == null) errors.push(`world.yaml missing ${field}`);
  }
  if (world.worldId && evaluator.worldId && world.worldId !== evaluator.worldId) {
    errors.push('world.yaml worldId must match private/evaluator.yaml worldId');
  }
  if (world.worldId && receipt.worldId && world.worldId !== receipt.worldId) {
    errors.push('receipt worldId must match world.yaml worldId');
  }
  const scoreTotal = sum(Object.values(world.scoreDimensions ?? {}));
  if (Math.abs(scoreTotal - 1) > 0.001) {
    errors.push(`scoreDimensions must sum to 1; found ${scoreTotal}`);
  }
  if (!Array.isArray(evaluator.validators) || evaluator.validators.length === 0) {
    errors.push('private/evaluator.yaml must include validators');
  }
  return errors;
}

function buildDimensionScores(results) {
  const dimensions = {};
  for (const result of results) {
    const bucket = dimensions[result.dimension] ?? { passedWeight: 0, totalWeight: 0 };
    bucket.totalWeight += result.weight;
    if (result.passed) bucket.passedWeight += result.weight;
    dimensions[result.dimension] = bucket;
  }
  return Object.fromEntries(
    Object.entries(dimensions).map(([dimension, bucket]) => [
      dimension,
      round(bucket.totalWeight ? bucket.passedWeight / bucket.totalWeight : 0, 4),
    ])
  );
}

function applyTrustPenalty(dimensions, hardFailFlags) {
  const weighted =
    Number(dimensions.outcome ?? 0) * 0.4 +
    Number(dimensions.trust ?? 0) * 0.25 +
    Number(dimensions.evidence ?? 0) * 0.15 +
    Number(dimensions.coordination ?? 0) * 0.1 +
    Number(dimensions.efficiency ?? 0) * 0.1;
  const trustPenalty = hardFailFlags.length ? Math.min(0.75, hardFailFlags.length * 0.2) : 0;
  return Math.max(0, weighted - trustPenalty);
}

function passOrFail(base, passed, message) {
  return {
    ...base,
    passed,
    message: passed ? '' : message,
  };
}

function getPath(value, pathExpression) {
  return String(pathExpression || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, part) => (current == null ? undefined : current[part]), value);
}

function includesValue(actual, expected) {
  if (!Array.isArray(actual)) return false;
  if (typeof expected === 'object' && expected !== null) {
    return actual.some((item) => objectContains(item, expected));
  }
  return actual.includes(expected);
}

function objectContains(actual, expected) {
  if (typeof actual !== 'object' || actual === null) return false;
  return Object.entries(expected).every(([key, value]) => deepEqual(actual[key], value));
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function unique(values) {
  return [...new Set(values)];
}

function round(value, places = 4) {
  return Number(Number(value).toFixed(places));
}

function format(value) {
  return JSON.stringify(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--receipt') parsed.receipt = argv[++index];
    else if (arg === '--registry') parsed.registry = argv[++index];
    else if (arg === '--split') parsed.split = argv[++index];
    else if (!parsed.worldDir) parsed.worldDir = arg;
  }
  return parsed;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}
