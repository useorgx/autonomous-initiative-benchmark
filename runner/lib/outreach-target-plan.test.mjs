// Run: node --test runner/lib/outreach-target-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTREACH_PLAN_VERSION,
  buildOutreachDraftPackage,
  validateOutreachTargetPlan,
} from './outreach-target-plan.mjs';

function basePlan(overrides = {}) {
  return {
    plan_version: OUTREACH_PLAN_VERSION,
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
      template('methodology-review-short', 'methodology_advisor', 'Protocol review request', 'Could you critique the protocol review design?'),
      template('paid-practitioner-baseline-short', 'paid_practitioner_baseline', 'Paid timed expert session', 'Could you do a paid timed baseline review?'),
      template('replication-partner-short', 'replication_partner', 'Independent replication request', 'Could you run a replication review?'),
      template('stranger-reproduction-short', 'stranger_reproduction_reviewer', 'Outside reproduction request', 'Could you reproduce the public release?'),
    ],
    targets: [
      target('methodology-metr', 'methodology_advisor', 'methodology-review-short'),
      target('baseline-practitioner-pool', 'paid_practitioner_baseline', 'paid-practitioner-baseline-short', {
        contact: { method: 'marketplace', value: 'vetted contractor platform' },
      }),
      target('replication-tau', 'replication_partner', 'replication-partner-short'),
      target('reproduction-engineer', 'stranger_reproduction_reviewer', 'stranger-reproduction-short', {
        contact: { method: 'warm_intro_needed' },
      }),
    ],
    ...overrides,
  };
}

test('validateOutreachTargetPlan accepts a strict four-lane outreach plan', () => {
  const result = validateOutreachTargetPlan(basePlan(), { strict: true });

  assert.equal(result.ok, true);
  assert.equal(result.summary.targets, 4);
  assert.equal(result.summary.by_lane.methodology_advisor, 1);
  assert.equal(result.summary.by_lane.paid_practitioner_baseline, 1);
  assert.equal(result.summary.by_lane.replication_partner, 1);
  assert.equal(result.summary.by_lane.stranger_reproduction_reviewer, 1);
});

test('validateOutreachTargetPlan rejects outbound hype and missing lanes', () => {
  const plan = basePlan({
    templates: [
      template('bad-template', 'methodology_advisor', 'SOTA benchmark review', 'This is undeniable. Please review.'),
    ],
    targets: [
      target('manual-but-sent', 'methodology_advisor', 'bad-template', {
        status: 'sent',
        contact: { method: 'manual_research_needed' },
      }),
    ],
  });

  const result = validateOutreachTargetPlan(plan, { strict: true });
  const text = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(text, /must not assert SOTA\/undeniable/);
  assert.match(text, /cannot move beyond identified/);
  assert.match(text, /sent_at is required/);
  assert.match(text, /must include at least one paid_practitioner_baseline target/);
});

test('validateOutreachTargetPlan warns when queued outside allowed send window', () => {
  const plan = basePlan({
    targets: [
      target('queued-late', 'methodology_advisor', 'methodology-review-short', {
        status: 'queued',
      }),
      target('baseline-practitioner-pool', 'paid_practitioner_baseline', 'paid-practitioner-baseline-short', {
        contact: { method: 'marketplace', value: 'vetted contractor platform' },
      }),
      target('replication-tau', 'replication_partner', 'replication-partner-short'),
      target('reproduction-engineer', 'stranger_reproduction_reviewer', 'stranger-reproduction-short', {
        contact: { method: 'warm_intro_needed' },
      }),
    ],
  });

  const result = validateOutreachTargetPlan(plan, {
    strict: true,
    now: '2026-07-09T01:30:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.match(result.warnings.join('\n'), /outside the allowed send window/);
});

test('buildOutreachDraftPackage materializes blocked drafts without making them send-ready', () => {
  const plan = basePlan({
    targets: [
      target('contact-form-target', 'methodology_advisor', 'methodology-review-short', {
        contact: { method: 'contact_form', value: 'https://example.com/contact' },
      }),
      target('manual-target', 'replication_partner', 'replication-partner-short', {
        status: 'identified',
        contact: { method: 'manual_research_needed' },
      }),
      target('baseline-pool', 'paid_practitioner_baseline', 'paid-practitioner-baseline-short', {
        contact: { method: 'marketplace', value: 'expert marketplace' },
      }),
      target('reproduction-engineer', 'stranger_reproduction_reviewer', 'stranger-reproduction-short', {
        contact: { method: 'warm_intro_needed' },
      }),
    ],
  });

  const result = buildOutreachDraftPackage(plan, {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.draftPackage.summary.drafts, 4);
  assert.equal(result.draftPackage.summary.send_ready, 0);
  assert.equal(result.draftPackage.summary.recipient_facing_actions, 3);
  assert.equal(result.draftPackage.summary.next_recipient_action_at, '2026-07-09T13:00:00.000Z');
  assert.equal(result.draftPackage.drafts.every((draft) => draft.markdown.includes('Send Ready: no')), true);
  assert.equal(result.draftPackage.action_queue.some((action) => action.action_type === 'research_contact_route'), true);
  const contactFormAction = result.draftPackage.action_queue.find((action) => action.action_type === 'submit_contact_form');
  assert.equal(contactFormAction.blocked, false);
  assert.deepEqual(contactFormAction.block_reasons, []);
  assert.match(contactFormAction.execution_notes.join('\n'), /contact form/);
});

test('buildOutreachDraftPackage marks direct email drafts send-ready when fully resolved', () => {
  const plan = basePlan({
    templates: [
      template('methodology-review-short', 'methodology_advisor', 'Protocol review request', 'Hi <name>, could you critique <their work>?'),
      template('paid-practitioner-baseline-short', 'paid_practitioner_baseline', 'Paid timed expert session', 'Could you do a paid timed baseline review?'),
      template('replication-partner-short', 'replication_partner', 'Independent replication request', 'Could you run a replication review?'),
      template('stranger-reproduction-short', 'stranger_reproduction_reviewer', 'Outside reproduction request', 'Could you reproduce the public release?'),
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
  });

  const result = buildOutreachDraftPackage(plan, {
    generatedAt: '2026-07-09T02:00:00.000Z',
    strict: true,
  });
  const emailDraft = result.draftPackage.drafts.find((draft) => draft.target_id === 'email-target');

  assert.equal(result.ok, true);
  assert.equal(emailDraft.send_ready, true);
  assert.equal(emailDraft.dispatch_ready_now, false);
  assert.equal(emailDraft.contact_value, 'example@example.com');
  assert.match(emailDraft.body, /^Hi Dr\. Example,/);
  assert.equal(emailDraft.block_reasons.length, 0);

  const emailAction = result.draftPackage.action_queue.find((action) => action.target_id === 'email-target');
  assert.equal(emailAction.action_type, 'send_email');
  assert.equal(emailAction.blocked, false);
  assert.equal(emailAction.recommended_at, '2026-07-09T13:00:00.000Z');
});

test('buildOutreachDraftPackage distinguishes sendable later from dispatch-ready now', () => {
  const plan = basePlan({
    targets: [
      target('email-target', 'methodology_advisor', 'methodology-review-short', {
        name: 'Dr. Example',
        contact: { method: 'public_email', value: 'example@example.com' },
      }),
      target('baseline-practitioner-pool', 'paid_practitioner_baseline', 'paid-practitioner-baseline-short', {
        contact: { method: 'marketplace', value: 'vetted contractor platform' },
      }),
      target('replication-tau', 'replication_partner', 'replication-partner-short'),
      target('reproduction-engineer', 'stranger_reproduction_reviewer', 'stranger-reproduction-short', {
        contact: { method: 'warm_intro_needed' },
      }),
    ],
  });

  const result = buildOutreachDraftPackage(plan, {
    generatedAt: '2026-07-09T13:15:00.000Z',
    strict: true,
  });
  const emailDraft = result.draftPackage.drafts.find((draft) => draft.target_id === 'email-target');

  assert.equal(result.ok, true);
  assert.equal(emailDraft.send_ready, true);
  assert.equal(emailDraft.dispatch_ready_now, true);
  assert.equal(emailDraft.timing.planned_window_status, 'open');
  assert.equal(result.draftPackage.summary.dispatch_ready_now, 1);
});

function template(templateId, lane, subject, body) {
  return {
    template_id: templateId,
    lane,
    subject,
    body,
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
