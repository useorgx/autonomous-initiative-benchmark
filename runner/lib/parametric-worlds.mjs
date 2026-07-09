import { createHash } from 'node:crypto';

export const DEFAULT_RELIABILITY_THRESHOLDS = [0.5, 0.8];

const NUMERIC_KNOB_TYPES = new Set(['integer', 'number']);
const MONOTONIC_DIRECTIONS = new Set([
  'harder_when_increases',
  'harder_when_decreases',
  'nominal',
]);

export function worldGeneratorMetadata(world) {
  return world?.parametric ?? world?.generator ?? null;
}

export function validateGeneratorMetadata(generator) {
  const errors = [];
  if (!generator || typeof generator !== 'object') {
    return ['generator metadata is required'];
  }
  if (generator.type !== 'parametric') {
    errors.push('generator.type must be parametric');
  }
  if (!Array.isArray(generator.knobs) || generator.knobs.length === 0) {
    errors.push('generator.knobs must include at least one knob');
    return errors;
  }

  const names = new Set();
  for (const [index, knob] of generator.knobs.entries()) {
    const prefix = `generator.knobs[${index}]`;
    if (!knob || typeof knob !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(String(knob.name ?? ''))) {
      errors.push(`${prefix}.name must be snake_case and start with a letter`);
    } else if (names.has(knob.name)) {
      errors.push(`${prefix}.name duplicates ${knob.name}`);
    } else {
      names.add(knob.name);
    }
    if (!['integer', 'number', 'enum', 'boolean'].includes(knob.type)) {
      errors.push(`${prefix}.type must be integer, number, enum, or boolean`);
    }
    if (!MONOTONIC_DIRECTIONS.has(knob.monotonic ?? 'nominal')) {
      errors.push(`${prefix}.monotonic has an unsupported value`);
    }
    if (NUMERIC_KNOB_TYPES.has(knob.type)) {
      if (!Number.isFinite(Number(knob.min))) errors.push(`${prefix}.min must be numeric`);
      if (!Number.isFinite(Number(knob.max))) errors.push(`${prefix}.max must be numeric`);
      if (Number(knob.max) < Number(knob.min)) errors.push(`${prefix}.max must be >= min`);
      if (!Number.isFinite(Number(knob.default))) errors.push(`${prefix}.default must be numeric`);
      if (
        Number.isFinite(Number(knob.default)) &&
        (Number(knob.default) < Number(knob.min) || Number(knob.default) > Number(knob.max))
      ) {
        errors.push(`${prefix}.default must be between min and max`);
      }
    }
    if (knob.type === 'enum') {
      if (!Array.isArray(knob.values) || knob.values.length < 2) {
        errors.push(`${prefix}.values must include at least two values`);
      } else if (!knob.values.includes(knob.default)) {
        errors.push(`${prefix}.default must be one of values`);
      }
    }
    if (knob.type === 'boolean' && typeof knob.default !== 'boolean') {
      errors.push(`${prefix}.default must be boolean`);
    }
  }

  if (Array.isArray(generator.difficultySchedule)) {
    for (const [index, level] of generator.difficultySchedule.entries()) {
      if (!level || typeof level !== 'object') {
        errors.push(`generator.difficultySchedule[${index}] must be an object`);
      } else if (!level.knobs || typeof level.knobs !== 'object') {
        errors.push(`generator.difficultySchedule[${index}].knobs is required`);
      }
    }
  }

  return errors;
}

export function assertGeneratorMetadata(generator) {
  const errors = validateGeneratorMetadata(generator);
  if (errors.length > 0) {
    throw new Error(`invalid parametric generator metadata:\n- ${errors.join('\n- ')}`);
  }
}

export function normalizeKnobs(generator, overrides = {}) {
  assertGeneratorMetadata(generator);
  const normalized = {};
  for (const knob of generator.knobs) {
    const value = overrides[knob.name] ?? knob.default;
    normalized[knob.name] = normalizeKnobValue(knob, value);
  }
  return normalized;
}

export function buildDifficultySchedule(generator, options = {}) {
  assertGeneratorMetadata(generator);
  if (Array.isArray(generator.difficultySchedule) && generator.difficultySchedule.length > 0) {
    return generator.difficultySchedule.map((level, index) => {
      const knobs = normalizeKnobs(generator, level.knobs ?? {});
      return {
        id: String(level.id ?? `d${index + 1}`),
        label: String(level.label ?? level.id ?? `Difficulty ${index + 1}`),
        knobs,
        difficultyScore: round(
          Number.isFinite(Number(level.difficultyScore))
            ? Number(level.difficultyScore)
            : difficultyScoreForKnobs(generator, knobs),
          4
        ),
      };
    });
  }

  const axis = selectDifficultyAxis(generator);
  const levels = Math.max(1, Number(options.levels ?? generator.defaultLevels ?? 5));
  const values = numericSchedule(axis, levels);
  return values.map((value, index) => {
    const knobs = normalizeKnobs(generator, { [axis.name]: value });
    return {
      id: `d${index + 1}`,
      label: `${axis.name}=${value}`,
      knobs,
      difficultyScore: difficultyScoreForKnobs(generator, knobs),
    };
  });
}

export function buildParametricInstanceId({ worldId, seedIndex, knobs }) {
  const hash = stableHash({ worldId, seedIndex, knobs }).slice(0, 12);
  return `${worldId}:s${seedIndex}:${hash}`;
}

export function deterministicStateHash({ worldId, seedIndex, knobs, state }) {
  return stableHash({ worldId, seedIndex, knobs, state });
}

export function materializeWorldForEpisode(world, { seedIndex, difficulty = null } = {}) {
  const generator = worldGeneratorMetadata(world);
  if (!generator) return world;
  const knobs = difficulty?.knobs ?? normalizeKnobs(generator);
  if (typeof world.generateInstance !== 'function') {
    throw new Error(`${world.id} declares a parametric generator but has no generateInstance({ seedIndex, knobs }) function`);
  }
  const materialized = world.generateInstance({ seedIndex, knobs, difficulty });
  const instanceId = buildParametricInstanceId({ worldId: world.id, seedIndex, knobs });
  return {
    ...materialized,
    id: world.id,
    baseWorldId: world.id,
    parametric: generator,
    difficulty: {
      ...(difficulty ?? {}),
      knobs,
      instanceId,
      stateHash: materialized.serializedState
        ? deterministicStateHash({ worldId: world.id, seedIndex, knobs, state: materialized.serializedState })
        : null,
    },
  };
}

export function assessMonotoneDifficulty(points, options = {}) {
  const tolerance = Number(options.tolerance ?? 0.0001);
  const sorted = points
    .map((point) => ({
      difficultyScore: Number(point.difficultyScore ?? point.difficulty ?? point.level),
      passRate: Number(point.passRate ?? point.passAtK),
    }))
    .filter((point) => Number.isFinite(point.difficultyScore) && Number.isFinite(point.passRate))
    .sort((a, b) => a.difficultyScore - b.difficultyScore);

  const violations = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.passRate > previous.passRate + tolerance) {
      violations.push({
        from: previous.difficultyScore,
        to: current.difficultyScore,
        previousPassRate: previous.passRate,
        currentPassRate: current.passRate,
      });
    }
  }

  return {
    ok: violations.length === 0,
    points: sorted,
    violations,
  };
}

export function estimateReliabilityHorizons(points, thresholds = DEFAULT_RELIABILITY_THRESHOLDS) {
  const sorted = points
    .map((point) => ({
      difficultyScore: Number(point.difficultyScore ?? point.difficulty ?? point.level),
      passRate: Number(point.passRate ?? point.passAtK),
    }))
    .filter((point) => Number.isFinite(point.difficultyScore) && Number.isFinite(point.passRate))
    .sort((a, b) => a.difficultyScore - b.difficultyScore);

  return Object.fromEntries(
    thresholds.map((threshold) => {
      const eligible = sorted.filter((point) => point.passRate >= threshold);
      const horizon = eligible.length ? eligible.at(-1).difficultyScore : null;
      return [`p${Math.round(threshold * 100)}`, horizon == null ? null : round(horizon, 4)];
    })
  );
}

export function selectAdaptiveDifficultyLevel({ schedule, results = [], passThreshold = 0.8, floorThreshold = 0.5 }) {
  const ordered = [...schedule].sort((left, right) => left.difficultyScore - right.difficultyScore);
  if (ordered.length === 0) {
    return { complete: true, reason: 'empty_schedule', next: null, horizonCandidate: null };
  }
  if (!Array.isArray(results) || results.length === 0) {
    return { complete: false, reason: 'start', next: ordered[0], horizonCandidate: null };
  }

  const resultByLevel = new Map(results.map((result) => [String(result.difficultyId ?? result.id), result]));
  const attempted = ordered
    .map((level) => ({ level, result: resultByLevel.get(String(level.id)) }))
    .filter((item) => item.result);
  if (attempted.length === 0) {
    return { complete: false, reason: 'start', next: ordered[0], horizonCandidate: null };
  }

  const latest = attempted.at(-1);
  const passRate = Number(latest.result.passRate ?? latest.result.passAtK);
  const horizonCandidate = attempted
    .filter((item) => Number(item.result.passRate ?? item.result.passAtK) >= floorThreshold)
    .at(-1)?.level ?? null;

  if (passRate >= passThreshold) {
    const next = ordered[ordered.findIndex((level) => level.id === latest.level.id) + 1] ?? null;
    return next
      ? { complete: false, reason: 'escalate', next, horizonCandidate }
      : { complete: true, reason: 'max_difficulty_saturated', next: null, horizonCandidate: latest.level };
  }

  if (passRate < floorThreshold) {
    return { complete: true, reason: 'below_floor', next: null, horizonCandidate };
  }

  return { complete: true, reason: 'frontier_band_found', next: null, horizonCandidate: latest.level };
}

export function stableHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizeKnobValue(knob, rawValue) {
  if (knob.type === 'integer') {
    const value = Number(rawValue);
    if (!Number.isInteger(value)) throw new Error(`${knob.name} must be an integer`);
    assertNumericBounds(knob, value);
    return value;
  }
  if (knob.type === 'number') {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new Error(`${knob.name} must be numeric`);
    assertNumericBounds(knob, value);
    return value;
  }
  if (knob.type === 'enum') {
    if (!knob.values.includes(rawValue)) throw new Error(`${knob.name} must be one of ${knob.values.join(', ')}`);
    return rawValue;
  }
  if (knob.type === 'boolean') {
    if (typeof rawValue !== 'boolean') throw new Error(`${knob.name} must be boolean`);
    return rawValue;
  }
  return rawValue;
}

function assertNumericBounds(knob, value) {
  if (value < Number(knob.min) || value > Number(knob.max)) {
    throw new Error(`${knob.name}=${value} is outside [${knob.min}, ${knob.max}]`);
  }
}

function selectDifficultyAxis(generator) {
  const named = generator.difficultyAxis
    ? generator.knobs.find((knob) => knob.name === generator.difficultyAxis)
    : null;
  if (named) return named;
  const monotoneNumeric = generator.knobs.find(
    (knob) => NUMERIC_KNOB_TYPES.has(knob.type) && (knob.monotonic ?? 'nominal') !== 'nominal'
  );
  if (monotoneNumeric) return monotoneNumeric;
  const anyNumeric = generator.knobs.find((knob) => NUMERIC_KNOB_TYPES.has(knob.type));
  if (anyNumeric) return anyNumeric;
  throw new Error('parametric generator needs a numeric difficulty axis or explicit difficultySchedule');
}

function numericSchedule(knob, levels) {
  const min = Number(knob.min);
  const max = Number(knob.max);
  if (levels <= 1) return [normalizeNumericForKnob(knob, min)];
  const values = [];
  for (let index = 0; index < levels; index += 1) {
    const value = min + ((max - min) * index) / (levels - 1);
    values.push(normalizeNumericForKnob(knob, value));
  }
  return [...new Set(values)];
}

function normalizeNumericForKnob(knob, value) {
  return knob.type === 'integer' ? Math.round(value) : round(value, 4);
}

function difficultyScoreForKnobs(generator, knobs) {
  const parts = generator.knobs
    .filter((knob) => NUMERIC_KNOB_TYPES.has(knob.type) && (knob.monotonic ?? 'nominal') !== 'nominal')
    .map((knob) => {
      const span = Number(knob.max) - Number(knob.min);
      if (span <= 0) return 0;
      const value = Number(knobs[knob.name]);
      const normalized = (value - Number(knob.min)) / span;
      return knob.monotonic === 'harder_when_decreases' ? 1 - normalized : normalized;
    });
  if (parts.length === 0) return 0;
  return round(parts.reduce((sum, value) => sum + value, 0) / parts.length, 4);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}
