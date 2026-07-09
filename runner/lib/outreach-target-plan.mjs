export const OUTREACH_PLAN_VERSION = 'sota_outreach_plan_v1';

export const OUTREACH_LANES = new Set([
  'methodology_advisor',
  'paid_practitioner_baseline',
  'replication_partner',
  'stranger_reproduction_reviewer',
]);

export const OUTREACH_STATUSES = new Set([
  'identified',
  'drafted',
  'queued',
  'sent',
  'replied',
  'declined',
  'scheduled',
  'completed',
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const RECIPIENT_FACING_ACTIONS = new Set([
  'send_email',
  'submit_contact_form',
  'request_warm_intro',
  'post_paid_baseline_recruiting_task',
]);

const TERMINAL_STATUSES = new Set(['replied', 'declined', 'scheduled', 'completed']);

export function validateOutreachTargetPlan(plan, { strict = false, now = null } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(plan)) {
    return invalid({ strict, errors: ['outreach plan must be an object.'], warnings });
  }
  if (plan.plan_version !== OUTREACH_PLAN_VERSION) {
    errors.push(`plan_version must be ${OUTREACH_PLAN_VERSION}.`);
  }
  if (!isIso(plan.generated_at)) errors.push('generated_at must be an ISO timestamp.');

  const sendPolicy = plan.send_policy;
  if (!isRecord(sendPolicy)) {
    errors.push('send_policy is required.');
  } else {
    if (!Array.isArray(sendPolicy.allowed_weekdays) || sendPolicy.allowed_weekdays.length === 0) {
      errors.push('send_policy.allowed_weekdays must contain allowed weekday names.');
    }
    if (!Number.isInteger(sendPolicy.local_send_hour_start) || !Number.isInteger(sendPolicy.local_send_hour_end)) {
      errors.push('send_policy local send hours must be integers.');
    } else if (sendPolicy.local_send_hour_start < 6 || sendPolicy.local_send_hour_end > 17 || sendPolicy.local_send_hour_start >= sendPolicy.local_send_hour_end) {
      errors.push('send_policy local send hours must be a conservative daytime window.');
    }
    if (sendPolicy.no_blasts !== true) errors.push('send_policy.no_blasts must be true.');
    if (!Number.isInteger(sendPolicy.max_first_wave_targets) || sendPolicy.max_first_wave_targets < 1 || sendPolicy.max_first_wave_targets > 10) {
      errors.push('send_policy.max_first_wave_targets must be between 1 and 10.');
    }
    if (sendPolicy.max_per_send_window !== undefined) {
      if (!Number.isInteger(sendPolicy.max_per_send_window) || sendPolicy.max_per_send_window < 1 || sendPolicy.max_per_send_window > sendPolicy.max_first_wave_targets) {
        errors.push('send_policy.max_per_send_window must be between 1 and max_first_wave_targets.');
      }
    }
    if (sendPolicy.send_spacing_minutes !== undefined) {
      if (!Number.isInteger(sendPolicy.send_spacing_minutes) || sendPolicy.send_spacing_minutes < 10 || sendPolicy.send_spacing_minutes > 180) {
        errors.push('send_policy.send_spacing_minutes must be between 10 and 180.');
      }
    }
    if (sendPolicy.follow_up_business_days !== undefined) {
      if (
        !Array.isArray(sendPolicy.follow_up_business_days) ||
        sendPolicy.follow_up_business_days.length === 0 ||
        !sendPolicy.follow_up_business_days.every((day) => Number.isInteger(day) && day > 0 && day <= 30)
      ) {
        errors.push('send_policy.follow_up_business_days must be positive business-day offsets.');
      }
    }
  }

  const templates = Array.isArray(plan.templates) ? plan.templates : [];
  if (!Array.isArray(plan.templates) || templates.length === 0) errors.push('templates must be a non-empty array.');
  const templateIds = new Set();
  for (const [index, template] of templates.entries()) {
    validateTemplate({ template, index, errors, templateIds });
  }

  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  if (!Array.isArray(plan.targets) || targets.length === 0) errors.push('targets must be a non-empty array.');
  const targetIds = new Set();
  const lanes = new Set();
  const firstWaveTargets = [];

  for (const [index, target] of targets.entries()) {
    validateTarget({
      target,
      index,
      errors,
      warnings,
      targetIds,
      lanes,
      templateIds,
      firstWaveTargets,
      sendPolicy,
      now,
    });
  }

  if (strict) {
    for (const lane of OUTREACH_LANES) {
      if (!lanes.has(lane)) errors.push(`strict outreach plan must include at least one ${lane} target.`);
    }
    if (firstWaveTargets.length > Number(sendPolicy?.max_first_wave_targets ?? 0)) {
      errors.push(`first wave has ${firstWaveTargets.length} targets, above max_first_wave_targets.`);
    }
  }

  const summary = {
    targets: targets.length,
    templates: templates.length,
    first_wave_targets: firstWaveTargets.length,
    by_lane: Object.fromEntries(
      [...OUTREACH_LANES].map((lane) => [lane, targets.filter((target) => target?.lane === lane).length])
    ),
    by_status: Object.fromEntries(
      [...OUTREACH_STATUSES].map((status) => [status, targets.filter((target) => target?.status === status).length])
    ),
  };

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'outreach_plan_valid' : 'outreach_plan_invalid',
    summary,
    errors,
    warnings,
  };
}

export function buildOutreachDraftPackage(
  plan,
  { generatedAt = new Date().toISOString(), strict = true, includeIdentified = true } = {}
) {
  const validation = validateOutreachTargetPlan(plan, { strict });
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      draftPackage: null,
    };
  }

  const templates = new Map((plan.templates ?? []).map((template) => [template.template_id, template]));
  const targets = (plan.targets ?? []).filter((target) => includeIdentified || target.status !== 'identified');
  const drafts = targets.map((target) =>
    buildDraftForTarget({ target, template: templates.get(target.template_id), generatedAt, sendPolicy: plan.send_policy })
  );
  const actionQueue = buildActionQueue({ drafts, targets, sendPolicy: plan.send_policy, generatedAt });
  const draftPackage = {
    package_version: 'sota_outreach_drafts_v1',
    source_plan_version: plan.plan_version,
    generated_at: generatedAt,
    source_plan_generated_at: plan.generated_at,
    send_policy: plan.send_policy,
    summary: {
      drafts: drafts.length,
      send_ready: drafts.filter((draft) => draft.send_ready).length,
      dispatch_ready_now: drafts.filter((draft) => draft.dispatch_ready_now).length,
      blocked: drafts.filter((draft) => !draft.send_ready).length,
      recipient_facing_actions: actionQueue.filter((action) => action.recipient_facing).length,
      next_recipient_action_at:
        actionQueue.find((action) => action.recipient_facing && action.recommended_at)?.recommended_at ?? null,
      by_lane: Object.fromEntries(
        [...OUTREACH_LANES].map((lane) => [lane, drafts.filter((draft) => draft.lane === lane).length])
      ),
    },
    action_queue: actionQueue,
    drafts,
  };

  return {
    ok: true,
    errors: [],
    warnings: validation.warnings,
    draftPackage,
  };
}

function buildDraftForTarget({ target, template, generatedAt, sendPolicy }) {
  const subject = fillTemplate(template.subject, target);
  const body = fillTemplate(template.body, target);
  const blockReasons = sendBlockReasons({ target, subject, body });
  const contact = target.contact ?? {};
  const timing = timingForTarget({ target, generatedAt, sendPolicy });
  const actionType = actionTypeForTarget({ target, blockReasons });
  const draft = {
    draft_id: `${target.target_id}__${template.template_id}`,
    target_id: target.target_id,
    template_id: template.template_id,
    lane: target.lane,
    status: target.status,
    priority: target.priority,
    organization: target.organization ?? null,
    name: target.name ?? null,
    contact_method: contact.method ?? null,
    contact_value: contact.value ?? null,
    planned_send_window: target.planned_send_window ?? null,
    evidence_gaps: target.evidence_gaps ?? [],
    ask: target.ask,
    send_ready: blockReasons.length === 0,
    dispatch_ready_now:
      blockReasons.length === 0 &&
      actionType === 'send_email' &&
      timing.allowed_now === true &&
      timing.planned_window_status !== 'future' &&
      timing.planned_window_status !== 'elapsed',
    block_reasons: blockReasons,
    action_type: actionType,
    timing,
    subject,
    body,
  };
  draft.markdown = renderDraftMarkdown(draft, target);
  return draft;
}

function buildActionQueue({ drafts, targets, sendPolicy, generatedAt }) {
  const targetsById = new Map(targets.map((target) => [target.target_id, target]));
  const spacingMs = Number(sendPolicy?.send_spacing_minutes ?? 30) * 60 * 1000;
  const maxPerSendWindow = Number(sendPolicy?.max_per_send_window ?? sendPolicy?.max_first_wave_targets ?? 10);
  const groupedByWindow = new Map();
  const queue = [];

  const sortedDrafts = [...drafts].sort((a, b) => compareDraftPriority(a, b));
  for (const draft of sortedDrafts) {
    const target = targetsById.get(draft.target_id);
    const recipientFacing = RECIPIENT_FACING_ACTIONS.has(draft.action_type);
    const baseAction = {
      action_id: `${draft.target_id}__${draft.action_type}`,
      draft_id: draft.draft_id,
      target_id: draft.target_id,
      lane: draft.lane,
      priority: draft.priority,
      action_type: draft.action_type,
      recipient_facing: recipientFacing,
      dispatch_ready_now: draft.dispatch_ready_now,
      contact_method: draft.contact_method,
      contact_value: draft.contact_value,
      blocked: !recipientFacing || blockingActionTypes().has(draft.action_type),
      block_reasons: actionBlockReasons(draft),
      execution_notes: actionExecutionNotes(draft),
      recommended_at: null,
      timing_note: null,
    };

    if (!recipientFacing) {
      queue.push({
        ...baseAction,
        recommended_at: generatedAt,
        timing_note: 'Internal preparation action; safe to do immediately.',
      });
      continue;
    }

    const windowKey = plannedWindowKey(target?.planned_send_window);
    const windowCount = groupedByWindow.get(windowKey) ?? 0;
    const windowOffsetMs = Math.min(windowCount, maxPerSendWindow - 1) * spacingMs;
    const scheduled = recommendedRecipientActionTime({
      target,
      sendPolicy,
      generatedAt,
      offsetMs: windowOffsetMs,
    });
    groupedByWindow.set(windowKey, windowCount + 1);

    queue.push({
      ...baseAction,
      blocked: baseAction.blocked || !scheduled.recommendedAt || windowCount >= maxPerSendWindow,
      block_reasons: [
        ...baseAction.block_reasons,
        ...(scheduled.recommendedAt ? [] : ['no allowed recipient-facing send slot is available.']),
        ...(windowCount >= maxPerSendWindow ? ['planned send window exceeds max_per_send_window; move this target to a later wave.'] : []),
      ],
      recommended_at: scheduled.recommendedAt,
      timing_note: scheduled.note,
    });
  }

  return queue.sort(compareActionSchedule);
}

function recommendedRecipientActionTime({ target, sendPolicy, generatedAt, offsetMs }) {
  if (!isRecord(sendPolicy)) {
    return { recommendedAt: null, note: 'No send policy is available.' };
  }
  const plannedWindow = target?.planned_send_window;
  const nowMs = new Date(generatedAt).getTime();
  if (Number.isNaN(nowMs)) {
    return { recommendedAt: null, note: 'Generated timestamp is invalid.' };
  }

  if (isRecord(plannedWindow) && isIso(plannedWindow.start) && isIso(plannedWindow.end)) {
    const startMs = new Date(plannedWindow.start).getTime();
    const endMs = new Date(plannedWindow.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
      return { recommendedAt: null, note: 'Planned send window is invalid.' };
    }
    if (endMs < nowMs) {
      return { recommendedAt: null, note: 'Planned send window has elapsed; reschedule before outreach.' };
    }
    const candidate = new Date(Math.max(startMs + offsetMs, nowMs)).toISOString();
    const allowed = firstAllowedAt(candidate, sendPolicy, { endIso: plannedWindow.end });
    return {
      recommendedAt: allowed,
      note: allowed
        ? 'Recipient-facing action is scheduled inside the planned high-response window.'
        : 'No allowed slot remains inside the planned send window.',
    };
  }

  const allowed = firstAllowedAt(generatedAt, sendPolicy);
  return {
    recommendedAt: allowed,
    note: allowed
      ? 'Recipient-facing action is scheduled for the next allowed send-policy window.'
      : 'No allowed slot found within the planning horizon.',
  };
}

function firstAllowedAt(startIso, sendPolicy, { endIso = null } = {}) {
  const startMs = new Date(startIso).getTime();
  const endMs = endIso ? new Date(endIso).getTime() : startMs + 21 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  for (let cursorMs = startMs; cursorMs <= endMs; cursorMs += 15 * 60 * 1000) {
    const iso = new Date(cursorMs).toISOString();
    if (canSendAt(iso, sendPolicy)) return iso;
  }
  return null;
}

function timingForTarget({ target, generatedAt, sendPolicy }) {
  const planned = plannedWindowStatus(generatedAt, target.planned_send_window);
  return {
    evaluated_at: generatedAt,
    allowed_now: isRecord(sendPolicy) ? canSendAt(generatedAt, sendPolicy) : false,
    planned_window_status: planned.status,
    planned_window_start: planned.start,
    planned_window_end: planned.end,
  };
}

function plannedWindowStatus(isoTimestamp, plannedWindow) {
  if (!isRecord(plannedWindow) || !isIso(plannedWindow.start) || !isIso(plannedWindow.end)) {
    return { status: 'not_set', start: null, end: null };
  }
  const now = new Date(isoTimestamp).getTime();
  const start = new Date(plannedWindow.start).getTime();
  const end = new Date(plannedWindow.end).getTime();
  if ([now, start, end].some(Number.isNaN) || start >= end) {
    return { status: 'invalid', start: plannedWindow.start, end: plannedWindow.end };
  }
  if (now < start) return { status: 'future', start: plannedWindow.start, end: plannedWindow.end };
  if (now > end) return { status: 'elapsed', start: plannedWindow.start, end: plannedWindow.end };
  return { status: 'open', start: plannedWindow.start, end: plannedWindow.end };
}

function actionTypeForTarget({ target, blockReasons }) {
  const contact = target.contact ?? {};
  if (TERMINAL_STATUSES.has(target.status)) return 'closed';
  if (target.status === 'sent') return 'wait_for_reply';
  if (contact.method === 'manual_research_needed') return 'research_contact_route';
  if (contact.method === 'warm_intro_needed') return 'request_warm_intro';
  if (contact.method === 'marketplace') return 'post_paid_baseline_recruiting_task';
  if (contact.method === 'contact_form') return 'submit_contact_form';
  if (['known_email', 'public_email'].includes(contact.method)) {
    return blockReasons.length === 0 ? 'send_email' : 'fix_email_draft';
  }
  return 'fix_target_record';
}

function blockingActionTypes() {
  return new Set(['research_contact_route', 'fix_email_draft', 'fix_target_record', 'closed', 'wait_for_reply']);
}

function actionBlockReasons(draft) {
  if (blockingActionTypes().has(draft.action_type)) return draft.block_reasons;
  if (draft.action_type === 'submit_contact_form') {
    return draft.block_reasons.filter((reason) => reason !== 'target uses a contact form; create a form task, not a Gmail send.');
  }
  if (draft.action_type === 'post_paid_baseline_recruiting_task') {
    return draft.block_reasons.filter((reason) => reason !== 'target is a pool/marketplace listing, not a direct recipient.');
  }
  if (draft.action_type === 'request_warm_intro') {
    return draft.block_reasons.filter((reason) => reason !== 'target needs a warm intro before direct outreach.');
  }
  return draft.block_reasons;
}

function actionExecutionNotes(draft) {
  if (draft.action_type === 'submit_contact_form') {
    return ['Use the contact form at the scheduled time with the approved copy; do not create a Gmail send.'];
  }
  if (draft.action_type === 'post_paid_baseline_recruiting_task') {
    return ['Create or post a paid recruiting task through the chosen practitioner pool; this is not a direct-recipient email.'];
  }
  if (draft.action_type === 'request_warm_intro') {
    return ['Ask a trusted introducer first; send direct copy only after the target opts into the thread.'];
  }
  return [];
}

function compareDraftPriority(a, b) {
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) return priority;
  return String(a.target_id).localeCompare(String(b.target_id));
}

function compareActionSchedule(a, b) {
  const aTime = a.recommended_at ? new Date(a.recommended_at).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.recommended_at ? new Date(b.recommended_at).getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) return priority;
  return String(a.target_id).localeCompare(String(b.target_id));
}

function priorityRank(priority) {
  const match = String(priority ?? '').match(/^P(\d+)$/i);
  return match ? Number(match[1]) : 99;
}

function plannedWindowKey(plannedWindow) {
  if (!isRecord(plannedWindow)) return 'none';
  return `${plannedWindow.start ?? 'none'}__${plannedWindow.end ?? 'none'}`;
}

function fillTemplate(text, target) {
  return String(text ?? '')
    .replaceAll('<name>', salutationName(target))
    .replaceAll('<their work>', workReference(target))
    .replaceAll('<domain>', domainLabel(target));
}

function salutationName(target) {
  if (nonEmpty(target.name)) return target.name;
  if (target.contact?.method === 'marketplace' || target.contact?.method === 'warm_intro_needed') return 'there';
  if (nonEmpty(target.organization)) return `${target.organization} team`;
  return 'there';
}

function workReference(target) {
  const organization = String(target.organization ?? '');
  if (/METR/i.test(organization)) return "METR's time-horizon work";
  if (/SWE-bench/i.test(organization)) return 'SWE-bench Verified';
  if (/tau/i.test(organization)) return 'tau-bench';
  if (/WebArena|AgentCompany/i.test(organization)) return 'WebArena and TheAgentCompany';
  if (/Epoch|FrontierMath/i.test(organization)) return 'FrontierMath';
  return organization || 'your benchmark work';
}

function domainLabel(target) {
  const ask = target.ask ?? '';
  const covering = ask.match(/covering ([^.]+)\.?$/i);
  if (covering) return covering[1].replace(/_/g, ' ');
  const evidence = Array.isArray(target.evidence_gaps) ? target.evidence_gaps.join(', ') : '';
  return evidence.replace(/[-_]+/g, ' ') || 'the relevant domain';
}

function sendBlockReasons({ target, subject, body }) {
  const reasons = [];
  const contact = target.contact ?? {};
  if (target.status === 'identified') reasons.push('target is identified but not drafted/queued.');
  if (contact.method === 'manual_research_needed') reasons.push('contact route still needs manual research.');
  if (contact.method === 'warm_intro_needed') reasons.push('target needs a warm intro before direct outreach.');
  if (contact.method === 'marketplace') reasons.push('target is a pool/marketplace listing, not a direct recipient.');
  if (contact.method === 'contact_form') reasons.push('target uses a contact form; create a form task, not a Gmail send.');
  if (['known_email', 'public_email'].includes(contact.method) && !nonEmpty(contact.value)) {
    reasons.push('email contact method has no recipient value.');
  }
  if (/<[^>]+>/.test(`${subject}\n${body}`)) reasons.push('message still contains unresolved placeholders.');
  if (/\bSOTA\b|\bundeniable\b/i.test(`${subject}\n${body}`)) reasons.push('message contains prohibited hype language.');
  return reasons;
}

function renderDraftMarkdown(draft, target) {
  const contactLine = draft.contact_value ? `${draft.contact_method}: ${draft.contact_value}` : draft.contact_method;
  return [
    `# ${draft.target_id}`,
    '',
    `Lane: ${draft.lane}`,
    `Status: ${draft.status}`,
    `Priority: ${draft.priority}`,
    `Contact: ${contactLine ?? 'not set'}`,
    `Send Ready: ${draft.send_ready ? 'yes' : 'no'}`,
    `Dispatch Ready Now: ${draft.dispatch_ready_now ? 'yes' : 'no'}`,
    `Action Type: ${draft.action_type}`,
    `Planned Window: ${draft.timing.planned_window_status}`,
    draft.block_reasons.length ? `Block Reasons: ${draft.block_reasons.join('; ')}` : 'Block Reasons: none',
    `Evidence Gaps: ${draft.evidence_gaps.join(', ')}`,
    `Ask: ${draft.ask}`,
    target.rationale ? `Rationale: ${target.rationale}` : null,
    '',
    `Subject: ${draft.subject}`,
    '',
    draft.body,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function validateTemplate({ template, index, errors, templateIds }) {
  const prefix = `templates[${index}]`;
  if (!isRecord(template)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(template.template_id)) {
    errors.push(`${prefix}.template_id is required.`);
  } else if (templateIds.has(template.template_id)) {
    errors.push(`${prefix}.template_id ${template.template_id} is duplicated.`);
  } else {
    templateIds.add(template.template_id);
  }
  if (!OUTREACH_LANES.has(template.lane)) errors.push(`${prefix}.lane must be a known outreach lane.`);
  if (!nonEmpty(template.subject)) errors.push(`${prefix}.subject is required.`);
  if (!nonEmpty(template.body)) errors.push(`${prefix}.body is required.`);
  if (/\bSOTA\b|\bundeniable\b/i.test(`${template.subject}\n${template.body}`)) {
    errors.push(`${prefix} must not assert SOTA/undeniable in outbound copy.`);
  }
  if (!/\bcritique\b|\breview\b|\breplication\b|\breproduce\b|\btimed\b/i.test(template.body ?? '')) {
    errors.push(`${prefix}.body must contain the concrete ask.`);
  }
}

function validateTarget({
  target,
  index,
  errors,
  warnings,
  targetIds,
  lanes,
  templateIds,
  firstWaveTargets,
  sendPolicy,
  now,
}) {
  const prefix = `targets[${index}]`;
  if (!isRecord(target)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(target.target_id)) {
    errors.push(`${prefix}.target_id is required.`);
  } else if (targetIds.has(target.target_id)) {
    errors.push(`${prefix}.target_id ${target.target_id} is duplicated.`);
  } else {
    targetIds.add(target.target_id);
  }
  if (!OUTREACH_LANES.has(target.lane)) {
    errors.push(`${prefix}.lane must be a known outreach lane.`);
  } else {
    lanes.add(target.lane);
  }
  if (!OUTREACH_STATUSES.has(target.status)) errors.push(`${prefix}.status must be a known outreach status.`);
  if (!nonEmpty(target.priority)) errors.push(`${prefix}.priority is required.`);
  if (!nonEmpty(target.organization) && !nonEmpty(target.name)) errors.push(`${prefix} must include organization or name.`);
  if (!nonEmpty(target.rationale)) errors.push(`${prefix}.rationale is required.`);
  if (!Array.isArray(target.evidence_gaps) || target.evidence_gaps.length === 0) errors.push(`${prefix}.evidence_gaps is required.`);
  if (!nonEmpty(target.ask)) errors.push(`${prefix}.ask is required.`);
  if (!nonEmpty(target.template_id)) errors.push(`${prefix}.template_id is required.`);
  else if (!templateIds.has(target.template_id)) errors.push(`${prefix}.template_id ${target.template_id} does not exist.`);
  if (!isRecord(target.contact)) {
    errors.push(`${prefix}.contact is required.`);
  } else {
    if (!['known_email', 'public_email', 'contact_form', 'warm_intro_needed', 'marketplace', 'manual_research_needed'].includes(target.contact.method)) {
      errors.push(`${prefix}.contact.method is invalid.`);
    }
    if (['known_email', 'public_email'].includes(target.contact.method) && !nonEmpty(target.contact.value)) {
      errors.push(`${prefix}.contact.value is required for email contact methods.`);
    }
    if (target.contact.method === 'manual_research_needed' && target.status !== 'identified') {
      errors.push(`${prefix} cannot move beyond identified while contact.method is manual_research_needed.`);
    }
  }
  if (target.wave === 1) firstWaveTargets.push(target);
  if (target.status === 'sent' && !isIso(target.sent_at)) {
    errors.push(`${prefix}.sent_at is required when status is sent.`);
  }
  if (target.status === 'sent' && target.planned_send_window && !withinPlannedWindow(target.sent_at, target.planned_send_window)) {
    warnings.push(`${prefix}.sent_at is outside planned_send_window.`);
  }
  if (target.status === 'queued' && now && isRecord(sendPolicy) && !canSendAt(now, sendPolicy)) {
    warnings.push(`${prefix} is queued but current time is outside the allowed send window.`);
  }
}

export function canSendAt(isoTimestamp, sendPolicy) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: sendPolicy.time_zone ?? 'America/Chicago',
  }).format(date);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: sendPolicy.time_zone ?? 'America/Chicago',
    }).format(date)
  );
  return (
    sendPolicy.allowed_weekdays.includes(weekday) &&
    hour >= sendPolicy.local_send_hour_start &&
    hour < sendPolicy.local_send_hour_end
  );
}

function withinPlannedWindow(sentAt, plannedWindow) {
  if (!isIso(sentAt) || !isRecord(plannedWindow)) return true;
  const sent = new Date(sentAt).getTime();
  const start = new Date(plannedWindow.start).getTime();
  const end = new Date(plannedWindow.end).getTime();
  if ([sent, start, end].some(Number.isNaN)) return true;
  return sent >= start && sent <= end;
}

function invalid({ strict, errors, warnings }) {
  return {
    ok: false,
    strict,
    status: 'outreach_plan_invalid',
    summary: null,
    errors,
    warnings,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIso(value) {
  return nonEmpty(value) && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
}
