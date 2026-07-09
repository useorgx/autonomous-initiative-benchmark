import { createHash } from 'node:crypto';

export const OUTREACH_ACTION_LEDGER_VERSION = 'sota_outreach_action_ledger_v1';

export const OUTREACH_ACTION_STATUSES = new Set([
  'planned',
  'completed',
  'blocked',
  'replied',
  'declined',
  'scheduled',
  'canceled',
]);

const DRAFT_PACKAGE_VERSION = 'sota_outreach_drafts_v1';
const COMPLETED_STATUSES = new Set(['completed', 'replied', 'declined', 'scheduled']);
const FOLLOW_UP_ACTION_TYPES = new Set(['send_email', 'submit_contact_form', 'request_warm_intro']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

export function buildOutreachActionLedger(
  draftPackage,
  { generatedAt = new Date().toISOString(), strict = true } = {}
) {
  const draftValidation = validateDraftPackage(draftPackage);
  if (!draftValidation.ok) {
    return {
      ok: false,
      errors: draftValidation.errors,
      warnings: [],
      ledger: null,
    };
  }

  const draftsById = new Map((draftPackage.drafts ?? []).map((draft) => [draft.draft_id, draft]));
  const actions = (draftPackage.action_queue ?? []).map((action) => {
    const draft = draftsById.get(action.draft_id) ?? {};
    const messageSha = draft.subject || draft.body ? sha256(`${draft.subject ?? ''}\n\n${draft.body ?? ''}`) : null;
    return {
      action_id: action.action_id,
      draft_id: action.draft_id,
      target_id: action.target_id,
      lane: action.lane,
      priority: action.priority,
      action_type: action.action_type,
      status: action.blocked ? 'blocked' : 'planned',
      recipient_facing: Boolean(action.recipient_facing),
      recommended_at: action.recommended_at ?? null,
      contact_method: action.contact_method ?? null,
      contact_value: action.contact_value ?? null,
      message_sha256: messageSha,
      blocked_reasons: action.block_reasons ?? [],
      execution_notes: action.execution_notes ?? [],
      completed_at: null,
      operator: null,
      receipt: null,
      follow_up_schedule: [],
      notes: null,
    };
  });

  const ledger = {
    ledger_version: OUTREACH_ACTION_LEDGER_VERSION,
    source_draft_package_version: draftPackage.package_version,
    source_draft_generated_at: draftPackage.generated_at,
    generated_at: generatedAt,
    send_policy: draftPackage.send_policy,
    summary: summarizeActions(actions, { now: generatedAt }),
    actions,
  };

  const validation = validateOutreachActionLedger(ledger, { strict, now: generatedAt });
  return {
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
    ledger,
  };
}

export function validateOutreachActionLedger(ledger, { strict = false, now = null } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(ledger)) {
    return invalid({ errors: ['outreach action ledger must be an object.'], warnings, strict });
  }
  if (ledger.ledger_version !== OUTREACH_ACTION_LEDGER_VERSION) {
    errors.push(`ledger_version must be ${OUTREACH_ACTION_LEDGER_VERSION}.`);
  }
  if (ledger.source_draft_package_version !== DRAFT_PACKAGE_VERSION) {
    errors.push(`source_draft_package_version must be ${DRAFT_PACKAGE_VERSION}.`);
  }
  if (!isIso(ledger.generated_at)) errors.push('generated_at must be an ISO timestamp.');
  if (!Array.isArray(ledger.actions) || ledger.actions.length === 0) {
    errors.push('actions must be a non-empty array.');
  }

  const actionIds = new Set();
  const nowMs = now ? Date.parse(now) : null;
  for (const [index, action] of (ledger.actions ?? []).entries()) {
    const prefix = `actions[${index}]`;
    validateAction({ action, prefix, errors, warnings, actionIds, nowMs, strict });
  }

  const expected = summarizeActions(ledger.actions ?? [], { now });
  if (isRecord(ledger.summary)) {
    for (const key of ['total', 'planned', 'completed', 'blocked', 'recipient_facing']) {
      if (ledger.summary[key] !== expected[key]) {
        errors.push(`summary.${key} must be ${expected[key]}.`);
      }
    }
  } else {
    errors.push('summary is required.');
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'outreach_action_ledger_valid' : 'outreach_action_ledger_invalid',
    summary: expected,
    errors,
    warnings,
  };
}

export function recordOutreachAction(
  ledger,
  {
    actionId,
    status = 'completed',
    completedAt = new Date().toISOString(),
    operator = null,
    receiptChannel = null,
    receiptRef = null,
    receiptUrl = null,
    notes = null,
  } = {}
) {
  if (!nonEmpty(actionId)) throw new Error('actionId is required.');
  if (!OUTREACH_ACTION_STATUSES.has(status)) throw new Error(`status ${status} is invalid.`);
  if (!isIso(completedAt)) throw new Error('completedAt must be an ISO timestamp.');

  const action = (ledger.actions ?? []).find((candidate) => candidate.action_id === actionId);
  if (!action) throw new Error(`unknown action_id ${actionId}.`);
  if (action.recommended_at && Date.parse(completedAt) < Date.parse(action.recommended_at)) {
    throw new Error(`action ${actionId} cannot be completed before recommended_at.`);
  }

  action.status = status;
  action.completed_at = completedAt;
  action.operator = operator;
  action.notes = notes;

  if (COMPLETED_STATUSES.has(status)) {
    action.receipt = {
      channel: receiptChannel,
      reference: receiptRef,
      url: receiptUrl,
    };
    action.follow_up_schedule = buildFollowUpSchedule({
      action,
      completedAt,
      offsets: ledger.send_policy?.follow_up_business_days ?? [],
    });
  } else {
    action.receipt = null;
    action.follow_up_schedule = [];
  }

  ledger.summary = summarizeActions(ledger.actions, { now: completedAt });
  return ledger;
}

export function summarizeActions(actions, { now = null } = {}) {
  const nowMs = now ? Date.parse(now) : null;
  const dueActions = actions.filter((action) => isDue(action, nowMs));
  const plannedActions = actions.filter((action) => action?.status === 'planned');
  const recipientFacingActions = actions.filter((action) => action?.recipient_facing);
  const nextActionAt = minIso(plannedActions.map((action) => action.recommended_at).filter(Boolean));
  const nextFollowUpAt = minIso(
    actions.flatMap((action) =>
      (action.follow_up_schedule ?? [])
        .filter((followUp) => followUp.status === 'pending')
        .map((followUp) => followUp.due_at)
    )
  );

  return {
    total: actions.length,
    planned: plannedActions.length,
    completed: actions.filter((action) => COMPLETED_STATUSES.has(action?.status)).length,
    blocked: actions.filter((action) => action?.status === 'blocked').length,
    canceled: actions.filter((action) => action?.status === 'canceled').length,
    recipient_facing: recipientFacingActions.length,
    due_now: dueActions.length,
    next_action_at: nextActionAt,
    next_follow_up_at: nextFollowUpAt,
  };
}

function validateAction({ action, prefix, errors, warnings, actionIds, nowMs, strict }) {
  if (!isRecord(action)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(action.action_id)) {
    errors.push(`${prefix}.action_id is required.`);
  } else if (actionIds.has(action.action_id)) {
    errors.push(`${prefix}.action_id ${action.action_id} is duplicated.`);
  } else {
    actionIds.add(action.action_id);
  }
  if (!OUTREACH_ACTION_STATUSES.has(action.status)) errors.push(`${prefix}.status is invalid.`);
  if (!nonEmpty(action.target_id)) errors.push(`${prefix}.target_id is required.`);
  if (!nonEmpty(action.action_type)) errors.push(`${prefix}.action_type is required.`);
  if (action.recipient_facing !== true && action.recipient_facing !== false) {
    errors.push(`${prefix}.recipient_facing must be boolean.`);
  }
  if (action.recommended_at !== null && !isIso(action.recommended_at)) {
    errors.push(`${prefix}.recommended_at must be ISO or null.`);
  }
  if (action.recipient_facing && !nonEmpty(action.message_sha256)) {
    errors.push(`${prefix}.message_sha256 is required for recipient-facing actions.`);
  }
  if (action.status === 'planned' && Array.isArray(action.blocked_reasons) && action.blocked_reasons.length > 0) {
    errors.push(`${prefix} cannot be planned while blocked_reasons are present.`);
  }
  if (action.status === 'blocked' && strict && (!Array.isArray(action.blocked_reasons) || action.blocked_reasons.length === 0)) {
    errors.push(`${prefix}.blocked_reasons is required for blocked actions in strict mode.`);
  }
  if (COMPLETED_STATUSES.has(action.status)) {
    if (!isIso(action.completed_at)) errors.push(`${prefix}.completed_at is required for completed statuses.`);
    if (isIso(action.completed_at) && isIso(action.recommended_at) && Date.parse(action.completed_at) < Date.parse(action.recommended_at)) {
      errors.push(`${prefix}.completed_at cannot be before recommended_at.`);
    }
    if (!isRecord(action.receipt)) {
      errors.push(`${prefix}.receipt is required for completed statuses.`);
    } else {
      if (!nonEmpty(action.receipt.channel)) errors.push(`${prefix}.receipt.channel is required.`);
      if (!nonEmpty(action.receipt.reference)) errors.push(`${prefix}.receipt.reference is required.`);
    }
    if (FOLLOW_UP_ACTION_TYPES.has(action.action_type) && (!Array.isArray(action.follow_up_schedule) || action.follow_up_schedule.length === 0)) {
      warnings.push(`${prefix}.follow_up_schedule is empty for a follow-up eligible action.`);
    }
  }
  if (action.status === 'planned' && isDue(action, nowMs)) {
    warnings.push(`${prefix} is due for execution.`);
  }
}

function buildFollowUpSchedule({ action, completedAt, offsets }) {
  if (!FOLLOW_UP_ACTION_TYPES.has(action.action_type)) return [];
  return offsets.map((offset, index) => ({
    follow_up_id: `${action.action_id}__follow_up_${index + 1}`,
    sequence: index + 1,
    business_days_after_completion: offset,
    due_at: addBusinessDays(completedAt, offset),
    status: 'pending',
  }));
}

function addBusinessDays(isoTimestamp, businessDays) {
  const date = new Date(isoTimestamp);
  let remaining = businessDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString();
}

function validateDraftPackage(draftPackage) {
  const errors = [];
  if (!isRecord(draftPackage)) errors.push('draft package must be an object.');
  else {
    if (draftPackage.package_version !== DRAFT_PACKAGE_VERSION) {
      errors.push(`package_version must be ${DRAFT_PACKAGE_VERSION}.`);
    }
    if (!Array.isArray(draftPackage.action_queue) || draftPackage.action_queue.length === 0) {
      errors.push('action_queue must be a non-empty array.');
    }
    if (!Array.isArray(draftPackage.drafts) || draftPackage.drafts.length === 0) {
      errors.push('drafts must be a non-empty array.');
    }
  }
  return { ok: errors.length === 0, errors };
}

function isDue(action, nowMs) {
  if (nowMs === null || Number.isNaN(nowMs) || action?.status !== 'planned' || !isIso(action.recommended_at)) {
    return false;
  }
  return Date.parse(action.recommended_at) <= nowMs;
}

function minIso(values) {
  const sorted = values.filter(isIso).sort((a, b) => Date.parse(a) - Date.parse(b));
  return sorted[0] ?? null;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function invalid({ errors, warnings, strict }) {
  return {
    ok: false,
    strict,
    status: 'outreach_action_ledger_invalid',
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
