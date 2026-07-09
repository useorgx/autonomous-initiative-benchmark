import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadManifestBoundRunConfig(args, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (!args.runManifest) {
    throw new Error(
      '--run-manifest is required; benchmark execution must be bound to a preregistered run manifest.'
    );
  }
  if (!args.evaluationManifest) {
    throw new Error(
      '--evaluation-manifest is required so the run manifest can be checked against pinned model data.'
    );
  }

  const runManifest = await readJson(path.resolve(cwd, args.runManifest));
  const evaluationManifest = await readJson(
    path.resolve(cwd, args.evaluationManifest)
  );
  return resolveManifestBoundRunConfig({
    runManifest,
    evaluationManifest,
    args,
  });
}

export function resolveManifestBoundRunConfig({
  runManifest,
  evaluationManifest,
  args = {},
}) {
  const errors = [];
  const modelManifest = evaluationManifest?.modelManifest;
  const modelById = new Map();
  const modelByProviderModel = new Map();

  if (!isRecord(runManifest)) {
    errors.push('run manifest must be a JSON object');
  }
  if (!isRecord(evaluationManifest)) {
    errors.push('evaluation manifest must be a JSON object');
  }
  if (!isRecord(modelManifest)) {
    errors.push('evaluation manifest must include modelManifest');
  } else if (!Array.isArray(modelManifest.models)) {
    errors.push('evaluation manifest modelManifest.models must be an array');
  } else {
    for (const entry of modelManifest.models) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id === 'string') modelById.set(entry.id, entry);
      if (typeof entry.provider === 'string' && typeof entry.model === 'string') {
        modelByProviderModel.set(`${entry.provider}:${entry.model}`, entry);
      }
    }
  }

  if (runManifest.evaluationManifestId !== evaluationManifest.id) {
    errors.push(
      `runManifest.evaluationManifestId (${runManifest.evaluationManifestId ?? 'missing'}) must match evaluation manifest id (${evaluationManifest.id ?? 'missing'})`
    );
  }
  if (modelManifest?.id && runManifest.modelManifestId !== modelManifest.id) {
    errors.push(
      `runManifest.modelManifestId (${runManifest.modelManifestId ?? 'missing'}) must match modelManifest.id (${modelManifest.id})`
    );
  }

  const manifestArms = Array.isArray(runManifest.arms)
    ? runManifest.arms.filter(isRecord)
    : [];
  if (manifestArms.length === 0) {
    errors.push('run manifest must include at least one arm');
  }
  const manifestArmIds = new Set(
    manifestArms
      .map((arm) => (typeof arm.id === 'string' ? arm.id : null))
      .filter(Boolean)
  );
  for (const arm of manifestArms) {
    if (typeof arm.modelManifestId !== 'string') {
      errors.push(`run manifest arm ${arm.id ?? '<missing>'} is missing modelManifestId`);
    } else if (!modelById.has(arm.modelManifestId)) {
      errors.push(
        `run manifest arm ${arm.id ?? '<missing>'} references modelManifestId "${arm.modelManifestId}" which is absent from modelManifest.models`
      );
    }
  }

  const requestedArms = args.arms
    ? splitCsv(args.arms)
    : manifestArms.map((arm) => arm.id).filter(Boolean);
  const unknownArms = requestedArms.filter((arm) => !manifestArmIds.has(arm));
  if (unknownArms.length > 0) {
    errors.push(`requested arm(s) not declared in run manifest: ${unknownArms.join(', ')}`);
  }

  const manifestK = toPositiveInteger(runManifest.k);
  const requestedK = args.k == null ? manifestK : toPositiveInteger(args.k);
  if (!manifestK) {
    errors.push('run manifest k must be an integer >= 1');
  } else if (args.k != null && requestedK !== manifestK) {
    errors.push(`requested k=${args.k} is outside run manifest k=${manifestK}`);
  }

  const requestedSplit = args.split ?? runManifest.split;
  if (!runManifest.split) {
    errors.push('run manifest split is required');
  } else if (args.split && args.split !== runManifest.split) {
    errors.push(`requested split "${args.split}" is outside run manifest split "${runManifest.split}"`);
  }

  const selectedModel = selectModel({
    args,
    manifestArms,
    requestedArms,
    modelById,
    modelByProviderModel,
    errors,
  });

  if (errors.length > 0) {
    throw new Error(`run manifest contract failed:\n- ${errors.join('\n- ')}`);
  }

  return {
    runManifest,
    evaluationManifest,
    modelManifest,
    modelManifestEntry: selectedModel,
    provider: selectedModel.provider,
    model: selectedModel.model,
    k: manifestK,
    arms: requestedArms,
    split: requestedSplit,
    difficultySchedule: Array.isArray(runManifest.difficultySchedule)
      ? runManifest.difficultySchedule
      : [],
  };
}

function selectModel({
  args,
  manifestArms,
  requestedArms,
  modelById,
  modelByProviderModel,
  errors,
}) {
  const modelManifestId = args.modelManifestId ?? null;
  const explicitModelRequest = Boolean(modelManifestId || args.model);
  let selected = modelManifestId ? modelById.get(modelManifestId) : null;

  if (modelManifestId && !selected) {
    errors.push(`requested modelManifestId "${modelManifestId}" is absent from modelManifest.models`);
  }

  if (!selected && args.provider && args.model) {
    selected = modelByProviderModel.get(`${args.provider}:${args.model}`) ?? null;
    if (!selected) {
      errors.push(`requested provider/model "${args.provider}:${args.model}" is absent from modelManifest.models`);
    }
  }

  if (!selected && args.model) {
    const matches = [...modelById.values()].filter(
      (entry) => entry.model === args.model || entry.id === args.model
    );
    if (matches.length === 1) selected = matches[0];
    else if (matches.length > 1) {
      errors.push(`requested model "${args.model}" matches multiple model manifest entries; pass --model-manifest-id`);
    } else {
      errors.push(`requested model "${args.model}" is absent from modelManifest.models`);
    }
  }

  if (!selected && !explicitModelRequest) {
    const requestedArmSet = new Set(requestedArms);
    const selectedArmModelIds = [
      ...new Set(
        manifestArms
          .filter((arm) => requestedArmSet.has(arm.id))
          .map((arm) => arm.modelManifestId)
          .filter(Boolean)
      ),
    ];
    if (selectedArmModelIds.length === 1) {
      selected = modelById.get(selectedArmModelIds[0]) ?? null;
    } else if (selectedArmModelIds.length > 1) {
      errors.push(
        `requested arms reference multiple model manifest ids (${selectedArmModelIds.join(', ')}); pass --model-manifest-id`
      );
    }
  }

  if (selected && args.provider && selected.provider !== args.provider) {
    errors.push(
      `requested provider "${args.provider}" does not match model manifest provider "${selected.provider}"`
    );
  }
  if (selected && args.model && selected.model !== args.model && selected.id !== args.model) {
    errors.push(
      `requested model "${args.model}" does not match model manifest entry "${selected.id}" (${selected.model})`
    );
  }

  return selected ?? {};
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function splitCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
