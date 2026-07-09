import {
  HUMAN_BASELINE_MIN_N,
  HUMAN_BASELINE_PROTOCOL_VERSION,
  validateBaselineRecord,
} from './human-baselines.mjs';
import { normalizeExpertRosterInput } from './human-expert-roster.mjs';

export const HUMAN_BASELINE_PLAN_VERSION = 'human_baseline_plan_v1';
export const HUMAN_BASELINE_PACKET_VERSION = 'human_baseline_session_packets_v1';
export const HUMAN_BASELINE_SESSION_STATUSES = new Set(['completed', 'assigned', 'unassigned']);

const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

export function buildHumanBaselinePlan({
  registry,
  baselines = [],
  experts = [],
  releaseId = null,
  generatedAt = new Date().toISOString(),
  minimumHumans = HUMAN_BASELINE_MIN_N,
} = {}) {
  const errors = [];
  const holdoutWorlds = registry?.splits?.private_holdout?.worlds ?? [];
  if (!Array.isArray(holdoutWorlds) || holdoutWorlds.length === 0) {
    errors.push('registry.splits.private_holdout.worlds must contain committed holdout worlds.');
  }

  const validBaselines = [];
  let invalidBaselineRecords = 0;
  for (const record of Array.isArray(baselines) ? baselines : []) {
    const error = validateBaselineRecord(record, { requireProtocol: true });
    if (error) invalidBaselineRecords += 1;
    else validBaselines.push(record);
  }

  const expertPool = normalizeExpertRosterInput(experts);
  const expertUseCounts = new Map(expertPool.map((expert) => [expert.expert_id, 0]));
  const worlds = [];

  for (const world of holdoutWorlds) {
    const worldId = typeof world === 'string' ? world : world?.worldId;
    if (!nonEmpty(worldId)) {
      errors.push('private holdout world is missing worldId.');
      continue;
    }
    const domain = typeof world === 'object' && world ? world.domain ?? null : null;
    const sessions = [];
    const usedOperators = new Set();
    const completedBaselines = uniqueValidBaselinesForWorld(validBaselines, worldId);

    for (const baseline of completedBaselines.slice(0, minimumHumans)) {
      usedOperators.add(baseline.human_id);
      sessions.push({
        slot: sessions.length + 1,
        status: 'completed',
        world_id: worldId,
        domain,
        human_id: baseline.human_id,
        artifact_hash: baseline.artifact_hash,
        receipt_hash: baseline.receipt_hash,
        elapsed_seconds: baseline.elapsed_seconds,
        success: baseline.success,
        completed_at: baseline.completed_at,
      });
    }

    while (sessions.length < minimumHumans) {
      const expert = chooseExpert({ expertPool, expertUseCounts, usedOperators, domain });
      if (expert) {
        usedOperators.add(expert.expert_id);
        expertUseCounts.set(expert.expert_id, (expertUseCounts.get(expert.expert_id) ?? 0) + 1);
        sessions.push({
          slot: sessions.length + 1,
          status: 'assigned',
          world_id: worldId,
          domain,
          expert_id: expert.expert_id,
          operator_profile_hash: expert.operator_profile_hash ?? null,
          recruitment_channel: expert.recruitment_channel ?? null,
          due_at: expert.due_at ?? null,
        });
      } else {
        sessions.push({
          slot: sessions.length + 1,
          status: 'unassigned',
          world_id: worldId,
          domain,
          required_expertise: requiredExpertiseForDomain(domain),
        });
      }
    }

    worlds.push({
      world_id: worldId,
      domain,
      minimum_humans: minimumHumans,
      sessions,
      completed_sessions: sessions.filter((session) => session.status === 'completed').length,
      assigned_sessions: sessions.filter((session) => session.status === 'assigned').length,
      unassigned_sessions: sessions.filter((session) => session.status === 'unassigned').length,
    });
  }

  const plan = {
    protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
    plan_version: HUMAN_BASELINE_PLAN_VERSION,
    release_id: releaseId,
    generated_at: generatedAt,
    minimum_humans: minimumHumans,
    summary: summarizePlanWorlds(worlds, invalidBaselineRecords),
    worlds,
  };

  return {
    ok: errors.length === 0,
    errors,
    plan,
  };
}

export function validateHumanBaselinePlan(plan, { strict = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(plan)) {
    return invalid({ strict, errors: ['human baseline plan must be an object.'], warnings });
  }
  if (plan.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}.`);
  }
  if (plan.plan_version !== HUMAN_BASELINE_PLAN_VERSION) {
    errors.push(`plan_version must be ${HUMAN_BASELINE_PLAN_VERSION}.`);
  }
  if (!Number.isInteger(plan.minimum_humans) || plan.minimum_humans < 1) {
    errors.push('minimum_humans must be a positive integer.');
  }
  if (!isIso(plan.generated_at)) errors.push('generated_at must be an ISO timestamp.');

  const worlds = Array.isArray(plan.worlds) ? plan.worlds : [];
  if (!Array.isArray(plan.worlds)) errors.push('worlds must be an array.');

  for (const [worldIndex, world] of worlds.entries()) {
    validatePlanWorld({ world, worldIndex, minimumHumans: plan.minimum_humans, errors });
  }

  const computedSummary = summarizePlanWorlds(worlds, Number(plan.summary?.invalid_baseline_records ?? 0));
  validateSummary({ declared: plan.summary, computed: computedSummary, errors });

  if (computedSummary.unassigned_sessions > 0) {
    const message = `${computedSummary.unassigned_sessions} human-baseline sessions are unassigned.`;
    if (strict) errors.push(message);
    else warnings.push(message);
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'human_baseline_plan_valid' : 'human_baseline_plan_invalid',
    summary: computedSummary,
    errors,
    warnings,
  };
}

export function buildHumanBaselineSessionPackets(plan, { generatedAt = new Date().toISOString(), includeCompleted = false } = {}) {
  const validation = validateHumanBaselinePlan(plan, { strict: false });
  const errors = validation.ok ? [] : validation.errors;
  const packets = [];

  if (validation.ok) {
    for (const world of plan.worlds ?? []) {
      for (const session of world.sessions ?? []) {
        if (session.status === 'completed' && !includeCompleted) continue;
        packets.push(buildSessionPacket({ plan, world, session }));
      }
    }
  }

  const packetDocument = {
    packet_version: HUMAN_BASELINE_PACKET_VERSION,
    protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
    release_id: plan?.release_id ?? null,
    generated_at: generatedAt,
    source_plan_generated_at: plan?.generated_at ?? null,
    minimum_humans: plan?.minimum_humans ?? HUMAN_BASELINE_MIN_N,
    summary: {
      packets: packets.length,
      assigned_packets: packets.filter((packet) => packet.status === 'assigned').length,
      unassigned_packets: packets.filter((packet) => packet.status === 'unassigned').length,
      completed_packets: packets.filter((packet) => packet.status === 'completed').length,
    },
    packets,
  };

  return {
    ok: errors.length === 0,
    errors,
    packetDocument,
  };
}

function invalid({ strict, errors, warnings }) {
  return {
    ok: false,
    strict,
    status: 'human_baseline_plan_invalid',
    summary: null,
    errors,
    warnings,
  };
}

function buildSessionPacket({ plan, world, session }) {
  const packet = {
    packet_id: `${world.world_id}__slot_${session.slot}`,
    release_id: plan.release_id ?? null,
    protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
    world_id: world.world_id,
    domain: world.domain ?? null,
    slot: session.slot,
    status: session.status,
    minimum_humans: world.minimum_humans,
    required_expertise: session.required_expertise ?? requiredExpertiseForDomain(world.domain),
    blind_review_required: true,
    private_validator_access: false,
    instructions: [
      'Use only the session world access provided by the benchmark operator.',
      'Do not inspect private validators, hidden answers, or grader output before completing the artifact.',
      'Record started_at and completed_at from the actual timed session.',
      'Submit the final artifact and receipt hashes through record:human-baseline.',
    ],
    record_command_template:
      'npm run record:human-baseline -- --world <world_id> --human <human_id> --seconds <elapsed_seconds> --success true|false --started-at <iso> --completed-at <iso> --artifact-hash sha256:<64-hex> --receipt-hash sha256:<64-hex> --operator-profile-hash sha256:<64-hex> --blind-review-recorded-at <iso> --grader-verdict-revealed-at <iso>',
  };

  if (session.status === 'assigned') {
    packet.assignee_id = session.expert_id;
    packet.operator_profile_hash = session.operator_profile_hash ?? null;
    packet.recruitment_channel = session.recruitment_channel ?? null;
    packet.due_at = session.due_at ?? null;
  }
  if (session.status === 'completed') {
    packet.human_id = session.human_id;
    packet.artifact_hash = session.artifact_hash;
    packet.receipt_hash = session.receipt_hash;
    packet.elapsed_seconds = session.elapsed_seconds;
    packet.success = session.success;
    packet.completed_at = session.completed_at;
  }
  return packet;
}

function validatePlanWorld({ world, worldIndex, minimumHumans, errors }) {
  const prefix = `worlds[${worldIndex}]`;
  if (!isRecord(world)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(world.world_id)) errors.push(`${prefix}.world_id is required.`);
  if (world.minimum_humans !== minimumHumans) {
    errors.push(`${prefix}.minimum_humans must match plan.minimum_humans.`);
  }
  const sessions = Array.isArray(world.sessions) ? world.sessions : [];
  if (!Array.isArray(world.sessions)) errors.push(`${prefix}.sessions must be an array.`);
  if (sessions.length !== minimumHumans) {
    errors.push(`${prefix}.sessions must contain exactly ${minimumHumans} sessions.`);
  }
  const completedCount = sessions.filter((session) => session.status === 'completed').length;
  const assignedCount = sessions.filter((session) => session.status === 'assigned').length;
  const unassignedCount = sessions.filter((session) => session.status === 'unassigned').length;
  if (world.completed_sessions !== completedCount) {
    errors.push(`${prefix}.completed_sessions ${world.completed_sessions ?? '<missing>'} must equal computed ${completedCount}.`);
  }
  if (world.assigned_sessions !== assignedCount) {
    errors.push(`${prefix}.assigned_sessions ${world.assigned_sessions ?? '<missing>'} must equal computed ${assignedCount}.`);
  }
  if (world.unassigned_sessions !== unassignedCount) {
    errors.push(`${prefix}.unassigned_sessions ${world.unassigned_sessions ?? '<missing>'} must equal computed ${unassignedCount}.`);
  }

  const operators = new Set();
  sessions.forEach((session, sessionIndex) => {
    validatePlanSession({ session, prefix: `${prefix}.sessions[${sessionIndex}]`, world, operators, errors });
  });
}

function validatePlanSession({ session, prefix, world, operators, errors }) {
  if (!isRecord(session)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!Number.isInteger(session.slot) || session.slot < 1) errors.push(`${prefix}.slot must be a positive integer.`);
  if (!HUMAN_BASELINE_SESSION_STATUSES.has(session.status)) {
    errors.push(`${prefix}.status must be one of ${[...HUMAN_BASELINE_SESSION_STATUSES].join(', ')}.`);
  }
  if (session.world_id !== world.world_id) errors.push(`${prefix}.world_id must match ${world.world_id}.`);

  if (session.status === 'completed') {
    requireDistinctOperator({ id: session.human_id, label: `${prefix}.human_id`, operators, errors });
    if (!isSha256(session.artifact_hash)) errors.push(`${prefix}.artifact_hash must be sha256:<64 hex>.`);
    if (!isSha256(session.receipt_hash)) errors.push(`${prefix}.receipt_hash must be sha256:<64 hex>.`);
    if (!isFiniteNumber(session.elapsed_seconds) || session.elapsed_seconds < 0) {
      errors.push(`${prefix}.elapsed_seconds must be a non-negative number.`);
    }
    if (typeof session.success !== 'boolean') errors.push(`${prefix}.success must be a boolean.`);
    if (!isIso(session.completed_at)) errors.push(`${prefix}.completed_at must be an ISO timestamp.`);
  } else if (session.status === 'assigned') {
    requireDistinctOperator({ id: session.expert_id, label: `${prefix}.expert_id`, operators, errors });
    if (session.operator_profile_hash !== null && session.operator_profile_hash !== undefined && !isSha256(session.operator_profile_hash)) {
      errors.push(`${prefix}.operator_profile_hash must be null or sha256:<64 hex>.`);
    }
    if (session.due_at !== null && session.due_at !== undefined && !isIso(session.due_at)) {
      errors.push(`${prefix}.due_at must be null or an ISO timestamp.`);
    }
  } else if (session.status === 'unassigned') {
    if (!nonEmpty(session.required_expertise)) errors.push(`${prefix}.required_expertise is required for unassigned sessions.`);
  }
}

function requireDistinctOperator({ id, label, operators, errors }) {
  if (!nonEmpty(id)) {
    errors.push(`${label} is required.`);
    return;
  }
  if (operators.has(id)) errors.push(`${label} ${id} is duplicated within the world.`);
  operators.add(id);
}

function summarizePlanWorlds(worlds, invalidBaselineRecords = 0) {
  const sessions = worlds.flatMap((world) => (Array.isArray(world?.sessions) ? world.sessions : []));
  const completedSessions = sessions.filter((session) => session.status === 'completed').length;
  const assignedSessions = sessions.filter((session) => session.status === 'assigned').length;
  const unassignedSessions = sessions.filter((session) => session.status === 'unassigned').length;
  return {
    target_worlds: worlds.length,
    required_sessions: sessions.length,
    completed_sessions: completedSessions,
    assigned_sessions: assignedSessions,
    unassigned_sessions: unassignedSessions,
    worlds_complete: worlds.filter((world) => {
      const worldSessions = Array.isArray(world?.sessions) ? world.sessions : [];
      return worldSessions.filter((session) => session.status === 'completed').length >= world.minimum_humans;
    }).length,
    worlds_fully_assigned_or_complete: worlds.filter((world) => {
      const worldSessions = Array.isArray(world?.sessions) ? world.sessions : [];
      return worldSessions.length > 0 && worldSessions.every((session) => session.status !== 'unassigned');
    }).length,
    invalid_baseline_records: invalidBaselineRecords,
  };
}

function validateSummary({ declared, computed, errors }) {
  if (!isRecord(declared)) {
    errors.push('summary is required.');
    return;
  }
  for (const [field, value] of Object.entries(computed)) {
    if (declared[field] !== value) {
      errors.push(`summary.${field} ${declared[field] ?? '<missing>'} must equal computed ${value}.`);
    }
  }
}

function uniqueValidBaselinesForWorld(baselines, worldId) {
  const byHuman = new Map();
  for (const baseline of baselines) {
    if (baseline.world_id !== worldId || byHuman.has(baseline.human_id)) continue;
    byHuman.set(baseline.human_id, baseline);
  }
  return [...byHuman.values()].sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)));
}

function chooseExpert({ expertPool, expertUseCounts, usedOperators, domain }) {
  return expertPool.find((expert) => {
    if (usedOperators.has(expert.expert_id)) return false;
    if ((expertUseCounts.get(expert.expert_id) ?? 0) >= expert.max_sessions) return false;
    return expert.domains.includes('*') || expert.domains.includes(domain);
  });
}

function requiredExpertiseForDomain(domain) {
  return nonEmpty(domain) ? `${String(domain).replace(/[_-]+/g, ' ')} domain expert` : 'domain-matched expert';
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

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
