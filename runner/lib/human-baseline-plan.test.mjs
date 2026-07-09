// Run: node --test runner/lib/human-baseline-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_BASELINE_PACKET_VERSION,
  buildHumanBaselineSessionPackets,
  buildHumanBaselinePlan,
  validateHumanBaselinePlan,
} from './human-baseline-plan.mjs';
import {
  HUMAN_EXPERT_ROSTER_VERSION,
  validateHumanExpertRosterDocument,
} from './human-expert-roster.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function registry() {
  return {
    splits: {
      private_holdout: {
        worlds: [
          { worldId: 'holdout-1', domain: 'revenue_reconciliation' },
          { worldId: 'holdout-2', domain: 'design_accessibility' },
        ],
      },
    },
  };
}

function baseline(overrides = {}) {
  return {
    protocol_version: 'timed_expert_baseline_v2',
    world_id: 'holdout-1',
    human_id: 'expert-a',
    elapsed_seconds: 3600,
    success: true,
    started_at: '2026-07-09T10:00:00.000Z',
    completed_at: '2026-07-09T11:00:00.000Z',
    artifact_hash: hash('a'),
    receipt_hash: hash('b'),
    operator_profile_hash: hash('c'),
    blind_review_recorded_at: '2026-07-09T11:15:00.000Z',
    grader_verdict_revealed_at: '2026-07-09T11:30:00.000Z',
    ...overrides,
  };
}

test('buildHumanBaselinePlan creates unassigned slots for every holdout world without fabricating evidence', () => {
  const { ok, plan } = buildHumanBaselinePlan({
    registry: registry(),
    generatedAt: '2026-07-09T00:00:00.000Z',
  });

  assert.equal(ok, true);
  assert.equal(plan.summary.target_worlds, 2);
  assert.equal(plan.summary.required_sessions, 6);
  assert.equal(plan.summary.completed_sessions, 0);
  assert.equal(plan.summary.assigned_sessions, 0);
  assert.equal(plan.summary.unassigned_sessions, 6);

  const validation = validateHumanBaselinePlan(plan);
  assert.equal(validation.ok, true);
  assert.match(validation.warnings.join('\n'), /6 human-baseline sessions are unassigned/);

  const strict = validateHumanBaselinePlan(plan, { strict: true });
  assert.equal(strict.ok, false);
  assert.match(strict.errors.join('\n'), /unassigned/);
});

test('buildHumanBaselinePlan assigns distinct domain-matched experts without double-booking a world', () => {
  const experts = [
    { expert_id: 'rev-1', domains: ['revenue_reconciliation'], max_sessions: 2, operator_profile_hash: hash('1') },
    { expert_id: 'rev-2', domains: ['revenue_reconciliation'], max_sessions: 2 },
    { expert_id: 'any-1', domains: ['*'], max_sessions: 4 },
    { expert_id: 'design-1', domains: ['design_accessibility'], max_sessions: 1 },
    { expert_id: 'design-2', domains: ['design_accessibility'], max_sessions: 1 },
  ];
  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    experts,
    generatedAt: '2026-07-09T00:00:00.000Z',
  });

  assert.equal(plan.summary.assigned_sessions, 6);
  assert.equal(plan.summary.unassigned_sessions, 0);
  assert.equal(validateHumanBaselinePlan(plan, { strict: true }).ok, true);

  for (const world of plan.worlds) {
    const assigned = world.sessions.map((session) => session.expert_id).filter(Boolean);
    assert.equal(new Set(assigned).size, assigned.length);
  }
});

test('buildHumanBaselinePlan carries protocol-valid completed baselines into the plan', () => {
  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    baselines: [
      baseline({ human_id: 'expert-a' }),
      baseline({ human_id: 'expert-b', receipt_hash: hash('d'), completed_at: '2026-07-09T12:00:00.000Z' }),
      baseline({ human_id: 'expert-c', receipt_hash: hash('e'), completed_at: '2026-07-09T13:00:00.000Z' }),
      baseline({ human_id: 'bad-record', receipt_hash: 'not-a-hash' }),
    ],
    generatedAt: '2026-07-09T00:00:00.000Z',
  });

  assert.equal(plan.summary.completed_sessions, 3);
  assert.equal(plan.summary.invalid_baseline_records, 1);
  assert.equal(plan.worlds[0].completed_sessions, 3);
  assert.equal(plan.worlds[0].unassigned_sessions, 0);
  assert.equal(plan.worlds[1].unassigned_sessions, 3);
  assert.equal(validateHumanBaselinePlan(plan).ok, true);
});

test('validateHumanBaselinePlan catches duplicate operators and stale accounting', () => {
  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    experts: [
      { expert_id: 'expert-1', domains: ['*'], max_sessions: 10 },
      { expert_id: 'expert-2', domains: ['*'], max_sessions: 10 },
      { expert_id: 'expert-3', domains: ['*'], max_sessions: 10 },
    ],
    generatedAt: '2026-07-09T00:00:00.000Z',
  });
  plan.worlds[0].sessions[1].expert_id = plan.worlds[0].sessions[0].expert_id;
  plan.worlds[0].assigned_sessions = 99;
  plan.summary.assigned_sessions = 99;

  const result = validateHumanBaselinePlan(plan, { strict: true });
  const text = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(text, /duplicated within the world/);
  assert.match(text, /assigned_sessions 99 must equal computed/);
  assert.match(text, /summary.assigned_sessions 99 must equal computed/);
});

test('buildHumanBaselineSessionPackets exports reviewer-safe assigned and unassigned packets', () => {
  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    experts: [
      {
        expert_id: 'rev-1',
        domains: ['revenue_reconciliation'],
        max_sessions: 1,
        operator_profile_hash: hash('1'),
        recruitment_channel: 'expert-network',
        due_at: '2026-07-12T00:00:00.000Z',
      },
    ],
    generatedAt: '2026-07-09T00:00:00.000Z',
    releaseId: 'sota-headline-2026-q3',
  });

  const { ok, packetDocument } = buildHumanBaselineSessionPackets(plan, {
    generatedAt: '2026-07-09T01:00:00.000Z',
  });

  assert.equal(ok, true);
  assert.equal(packetDocument.packet_version, HUMAN_BASELINE_PACKET_VERSION);
  assert.equal(packetDocument.summary.packets, 6);
  assert.equal(packetDocument.summary.assigned_packets, 1);
  assert.equal(packetDocument.summary.unassigned_packets, 5);
  assert.equal(packetDocument.summary.completed_packets, 0);

  const assigned = packetDocument.packets.find((packet) => packet.status === 'assigned');
  assert.equal(assigned.assignee_id, 'rev-1');
  assert.equal(assigned.private_validator_access, false);
  assert.equal(assigned.blind_review_required, true);
  assert.match(assigned.record_command_template, /record:human-baseline/);
  assert.equal(JSON.stringify(packetDocument).includes('validatorBundleHash'), false);
});

test('buildHumanBaselineSessionPackets omits completed baseline packets by default', () => {
  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    baselines: [baseline()],
    generatedAt: '2026-07-09T00:00:00.000Z',
  });

  const withoutCompleted = buildHumanBaselineSessionPackets(plan, {
    generatedAt: '2026-07-09T01:00:00.000Z',
  }).packetDocument;
  const withCompleted = buildHumanBaselineSessionPackets(plan, {
    generatedAt: '2026-07-09T01:00:00.000Z',
    includeCompleted: true,
  }).packetDocument;

  assert.equal(withoutCompleted.summary.completed_packets, 0);
  assert.equal(withCompleted.summary.completed_packets, 1);
  assert.equal(withCompleted.packets.some((packet) => packet.human_id === 'expert-a'), true);
});

test('validateHumanExpertRosterDocument accepts a strict domain-covered roster', () => {
  const roster = {
    roster_version: HUMAN_EXPERT_ROSTER_VERSION,
    protocol_version: 'timed_expert_baseline_v2',
    release_id: 'sota-headline-2026-q3',
    generated_at: '2026-07-09T00:00:00.000Z',
    compensation_disclosed: true,
    experts: [
      validRosterExpert('rev-1', ['revenue_reconciliation'], 1, '1'),
      validRosterExpert('rev-2', ['revenue_reconciliation'], 1, '2'),
      validRosterExpert('rev-3', ['revenue_reconciliation'], 1, '3'),
      validRosterExpert('design-1', ['design_accessibility'], 1, '4'),
      validRosterExpert('design-2', ['design_accessibility'], 1, '5'),
      validRosterExpert('design-3', ['design_accessibility'], 1, '6'),
    ],
  };

  const validation = validateHumanExpertRosterDocument(roster, {
    registry: registry(),
    strict: true,
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.summary.experts, 6);
  assert.equal(validation.summary.covered_worlds, 2);
  assert.equal(validation.summary.assignable_sessions, 6);

  const { plan } = buildHumanBaselinePlan({
    registry: registry(),
    experts: roster,
    generatedAt: '2026-07-09T00:00:00.000Z',
  });
  assert.equal(validateHumanBaselinePlan(plan, { strict: true }).ok, true);
});

test('validateHumanExpertRosterDocument catches invalid roster evidence and insufficient coverage', () => {
  const roster = {
    roster_version: HUMAN_EXPERT_ROSTER_VERSION,
    protocol_version: 'timed_expert_baseline_v2',
    release_id: 'sota-headline-2026-q3',
    generated_at: '2026-07-09T00:00:00.000Z',
    compensation_disclosed: false,
    experts: [
      {
        ...validRosterExpert('rev-1', ['revenue_reconciliation'], 1, '1'),
        operator_profile_hash: 'not-a-hash',
        private_validator_access: true,
        conflict_attestation: {
          no_orgx_employee: true,
          no_private_validator_access: false,
          no_prior_holdout_access: true,
        },
      },
      validRosterExpert('rev-1', ['revenue_reconciliation'], 1, '2'),
    ],
  };

  const validation = validateHumanExpertRosterDocument(roster, {
    registry: registry(),
    strict: true,
  });
  const text = validation.errors.join('\n');

  assert.equal(validation.ok, false);
  assert.match(text, /compensation_disclosed must be true/);
  assert.match(text, /operator_profile_hash/);
  assert.match(text, /private_validator_access must be false/);
  assert.match(text, /no_private_validator_access must be true/);
  assert.match(text, /duplicated/);
  assert.match(text, /covers 0\/2 private holdout worlds/);
});

function validRosterExpert(expertId, domains, maxSessions, hashChar) {
  return {
    expert_id: expertId,
    domains,
    max_sessions: maxSessions,
    operator_profile_hash: hash(hashChar),
    recruitment_channel: 'direct-expert-outreach',
    compensation_disclosed: true,
    private_validator_access: false,
    conflict_attestation: {
      no_orgx_employee: true,
      no_private_validator_access: true,
      no_prior_holdout_access: true,
    },
  };
}
