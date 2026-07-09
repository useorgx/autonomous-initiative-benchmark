// Run: node --test runner/lib/outreach-action-ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOutreachDraftPackage } from './outreach-target-plan.mjs';
import {
  OUTREACH_ACTION_LEDGER_VERSION,
  buildOutreachActionLedger,
  recordOutreachAction,
  validateOutreachActionLedger,
} from './outreach-action-ledger.mjs';

test('buildOutreachActionLedger turns the action queue into planned ledger rows', () => {
  const draftPackage = buildDraftPackage();
  const result = buildOutreachActionLedger(draftPackage, {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ledger.ledger_version, OUTREACH_ACTION_LEDGER_VERSION);
  assert.equal(result.ledger.summary.total, 4);
  assert.equal(result.ledger.summary.planned, 4);
  assert.equal(result.ledger.summary.recipient_facing, 4);
  assert.equal(result.ledger.summary.next_action_at, '2026-07-09T13:00:00.000Z');
  assert.match(result.ledger.actions[0].message_sha256, /^sha256:[a-f0-9]{64}$/);
});

test('validateOutreachActionLedger warns when planned actions are due', () => {
  const ledger = buildOutreachActionLedger(buildDraftPackage(), {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  }).ledger;

  const result = validateOutreachActionLedger(ledger, {
    strict: true,
    now: '2026-07-09T13:01:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.due_now, 1);
  assert.match(result.warnings.join('\n'), /due for execution/);
});

test('recordOutreachAction rejects completion before recommended_at', () => {
  const ledger = buildOutreachActionLedger(buildDraftPackage(), {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  }).ledger;

  assert.throws(
    () =>
      recordOutreachAction(ledger, {
        actionId: 'email-target__send_email',
        completedAt: '2026-07-09T12:59:00.000Z',
        receiptChannel: 'gmail',
        receiptRef: 'draft-id',
      }),
    /cannot be completed before recommended_at/
  );
});

test('recordOutreachAction records receipts and follow-up dates after the window opens', () => {
  const ledger = buildOutreachActionLedger(buildDraftPackage(), {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  }).ledger;

  const updated = recordOutreachAction(ledger, {
    actionId: 'email-target__send_email',
    completedAt: '2026-07-09T13:05:00.000Z',
    operator: 'codex',
    receiptChannel: 'gmail',
    receiptRef: 'gmail-message-id',
    receiptUrl: 'https://mail.google.com/mail/u/0/#sent/example',
    notes: 'Sent during the scheduled window.',
  });
  const validation = validateOutreachActionLedger(updated, {
    strict: true,
    now: '2026-07-09T13:06:00.000Z',
  });
  const action = updated.actions.find((candidate) => candidate.action_id === 'email-target__send_email');

  assert.equal(validation.ok, true);
  assert.equal(validation.summary.due_now, 0);
  assert.equal(action.status, 'completed');
  assert.equal(action.receipt.reference, 'gmail-message-id');
  assert.equal(action.follow_up_schedule.length, 2);
  assert.equal(action.follow_up_schedule[0].due_at, '2026-07-14T13:05:00.000Z');
  assert.equal(action.follow_up_schedule[1].due_at, '2026-07-20T13:05:00.000Z');
});

function buildDraftPackage() {
  const result = buildOutreachDraftPackage(basePlan(), {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  });
  assert.equal(result.ok, true);
  return result.draftPackage;
}

function basePlan() {
  return {
    plan_version: 'sota_outreach_plan_v1',
    generated_at: '2026-07-09T01:40:00.000Z',
    send_policy: {
      time_zone: 'America/Chicago',
      allowed_weekdays: ['Tuesday', 'Wednesday', 'Thursday'],
      local_send_hour_start: 8,
      local_send_hour_end: 11,
      no_blasts: true,
      max_first_wave_targets: 8,
      max_per_send_window: 4,
      send_spacing_minutes: 30,
      follow_up_business_days: [3, 7],
    },
    templates: [
      {
        template_id: 'methodology-review-short',
        lane: 'methodology_advisor',
        subject: 'Protocol review request',
        body: 'Hi <name>, could you critique <their work>?',
      },
      {
        template_id: 'paid-practitioner-baseline-short',
        lane: 'paid_practitioner_baseline',
        subject: 'Paid timed expert session',
        body: 'Could you do a paid timed baseline review?',
      },
      {
        template_id: 'replication-partner-short',
        lane: 'replication_partner',
        subject: 'Independent replication request',
        body: 'Could you run a replication review?',
      },
      {
        template_id: 'stranger-reproduction-short',
        lane: 'stranger_reproduction_reviewer',
        subject: 'Outside reproduction request',
        body: 'Could you reproduce the public release?',
      },
    ],
    targets: [
      target('email-target', 'methodology_advisor', 'methodology-review-short', {
        name: 'Dr. Example',
        contact: { method: 'public_email', value: 'example@example.com' },
      }),
      target('baseline-practitioner-pool', 'paid_practitioner_baseline', 'paid-practitioner-baseline-short', {
        priority: 'P1',
        contact: { method: 'marketplace', value: 'vetted contractor platform' },
      }),
      target('replication-tau', 'replication_partner', 'replication-partner-short'),
      target('reproduction-engineer', 'stranger_reproduction_reviewer', 'stranger-reproduction-short', {
        contact: { method: 'warm_intro_needed' },
      }),
    ],
  };
}

function target(targetId, lane, templateId, overrides = {}) {
  return {
    target_id: targetId,
    lane,
    status: 'drafted',
    priority: 'P0',
    wave: 1,
    organization: targetId,
    contact: { method: 'contact_form', value: 'https://example.com' },
    rationale: `Rationale for ${targetId}.`,
    evidence_gaps: ['timed-human-baselines'],
    ask: `Ask for ${targetId}.`,
    template_id: templateId,
    planned_send_window: {
      start: '2026-07-09T13:00:00.000Z',
      end: '2026-07-09T16:00:00.000Z',
    },
    ...overrides,
  };
}
