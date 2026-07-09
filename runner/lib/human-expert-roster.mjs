import {
  HUMAN_BASELINE_MIN_N,
  HUMAN_BASELINE_PROTOCOL_VERSION,
} from './human-baselines.mjs';

export const HUMAN_EXPERT_ROSTER_VERSION = 'human_expert_roster_v1';

const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

export function normalizeExpertRosterInput(input) {
  const experts = Array.isArray(input) ? input : input?.experts;
  if (!Array.isArray(experts)) return [];
  return experts
    .filter((expert) => isRecord(expert) && nonEmpty(expert.expert_id))
    .map((expert) => ({
      ...expert,
      domains: Array.isArray(expert.domains) && expert.domains.length > 0 ? expert.domains.map(String) : ['*'],
      max_sessions: Number.isInteger(expert.max_sessions) && expert.max_sessions > 0 ? expert.max_sessions : Infinity,
    }));
}

export function validateHumanExpertRosterDocument(
  document,
  { registry = null, minimumHumans = HUMAN_BASELINE_MIN_N, strict = false } = {}
) {
  const errors = [];
  const warnings = [];

  if (Array.isArray(document)) {
    const experts = normalizeExpertRosterInput(document);
    if (strict) {
      errors.push(`expert roster must be a ${HUMAN_EXPERT_ROSTER_VERSION} document, not a legacy array.`);
    } else {
      warnings.push('legacy expert arrays are accepted for planning but are not a versioned roster contract.');
    }
    return finish({ strict, errors, warnings, experts, registry, minimumHumans });
  }

  if (!isRecord(document)) {
    return finish({
      strict,
      errors: ['expert roster must be an object.'],
      warnings,
      experts: [],
      registry,
      minimumHumans,
    });
  }

  if (document.roster_version !== HUMAN_EXPERT_ROSTER_VERSION) {
    errors.push(`roster_version must be ${HUMAN_EXPERT_ROSTER_VERSION}.`);
  }
  if (document.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}.`);
  }
  if (!isIso(document.generated_at)) errors.push('generated_at must be an ISO timestamp.');
  if (document.compensation_disclosed !== true) {
    errors.push('compensation_disclosed must be true for a headline-eligible expert roster.');
  }

  const experts = normalizeExpertRosterInput(document);
  if (!Array.isArray(document.experts)) {
    errors.push('experts must be an array.');
  } else if (document.experts.length === 0) {
    errors.push('experts must contain at least one expert.');
  }

  const seen = new Set();
  for (const [index, expert] of (document.experts ?? []).entries()) {
    const prefix = `experts[${index}]`;
    if (!isRecord(expert)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (!nonEmpty(expert.expert_id)) {
      errors.push(`${prefix}.expert_id is required.`);
    } else if (seen.has(expert.expert_id)) {
      errors.push(`${prefix}.expert_id ${expert.expert_id} is duplicated.`);
    } else {
      seen.add(expert.expert_id);
    }
    if (!Array.isArray(expert.domains) || expert.domains.length === 0 || !expert.domains.every(nonEmpty)) {
      errors.push(`${prefix}.domains must contain at least one domain or "*".`);
    }
    if (!Number.isInteger(expert.max_sessions) || expert.max_sessions < 1) {
      errors.push(`${prefix}.max_sessions must be a positive integer.`);
    }
    if (!isSha256(expert.operator_profile_hash)) {
      errors.push(`${prefix}.operator_profile_hash must be sha256:<64 hex>.`);
    }
    if (!nonEmpty(expert.recruitment_channel)) {
      errors.push(`${prefix}.recruitment_channel is required.`);
    }
    if (expert.compensation_disclosed !== true) {
      errors.push(`${prefix}.compensation_disclosed must be true.`);
    }
    if (expert.private_validator_access !== false) {
      errors.push(`${prefix}.private_validator_access must be false.`);
    }
    if (!isRecord(expert.conflict_attestation)) {
      errors.push(`${prefix}.conflict_attestation is required.`);
    } else {
      for (const field of ['no_orgx_employee', 'no_private_validator_access', 'no_prior_holdout_access']) {
        if (expert.conflict_attestation[field] !== true) {
          errors.push(`${prefix}.conflict_attestation.${field} must be true.`);
        }
      }
    }
    if (expert.due_at !== null && expert.due_at !== undefined && !isIso(expert.due_at)) {
      errors.push(`${prefix}.due_at must be null or an ISO timestamp.`);
    }
  }

  return finish({ strict, errors, warnings, experts, registry, minimumHumans });
}

function finish({ strict, errors, warnings, experts, registry, minimumHumans }) {
  const coverage = summarizeRosterCoverage({ experts, registry, minimumHumans });
  if (strict && coverage.target_worlds > 0) {
    if (coverage.covered_worlds < coverage.target_worlds) {
      errors.push(
        `expert roster covers ${coverage.covered_worlds}/${coverage.target_worlds} private holdout worlds with ${minimumHumans} distinct assignable experts.`
      );
    }
    if (coverage.assignable_sessions < coverage.required_sessions) {
      errors.push(
        `expert roster capacity covers ${coverage.assignable_sessions}/${coverage.required_sessions} required sessions.`
      );
    }
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'human_expert_roster_valid' : 'human_expert_roster_invalid',
    summary: {
      experts: experts.length,
      total_capacity: sumFiniteCapacity(experts),
      wildcard_experts: experts.filter((expert) => expert.domains.includes('*')).length,
      ...coverage,
    },
    errors,
    warnings,
  };
}

function summarizeRosterCoverage({ experts, registry, minimumHumans }) {
  const worlds = registry?.splits?.private_holdout?.worlds ?? [];
  const byWorld = [];
  let assignableSessions = 0;

  for (const world of Array.isArray(worlds) ? worlds : []) {
    const worldId = typeof world === 'string' ? world : world?.worldId;
    const domain = typeof world === 'object' && world ? world.domain ?? null : null;
    const matching = experts.filter((expert) => expert.domains.includes('*') || expert.domains.includes(domain));
    const distinctAssignableExperts = matching.length;
    const sessionCapacity = matching.reduce((sum, expert) => sum + finiteCapacity(expert), 0);
    assignableSessions += Math.min(minimumHumans, distinctAssignableExperts, sessionCapacity);
    byWorld.push({
      world_id: worldId ?? null,
      domain,
      distinct_assignable_experts: distinctAssignableExperts,
      session_capacity: sessionCapacity,
      covered: distinctAssignableExperts >= minimumHumans && sessionCapacity >= minimumHumans,
    });
  }

  const targetWorlds = byWorld.length;
  return {
    target_worlds: targetWorlds,
    required_sessions: targetWorlds * minimumHumans,
    covered_worlds: byWorld.filter((world) => world.covered).length,
    assignable_sessions: assignableSessions,
    by_world: byWorld,
  };
}

function sumFiniteCapacity(experts) {
  return experts.reduce((sum, expert) => sum + finiteCapacity(expert), 0);
}

function finiteCapacity(expert) {
  return Number.isFinite(expert.max_sessions) ? expert.max_sessions : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIso(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isSha256(value) {
  return typeof value === 'string' && SHA_256_RE.test(value);
}
