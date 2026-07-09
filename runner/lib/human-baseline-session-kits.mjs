import { createHash } from 'node:crypto';

import { HUMAN_BASELINE_PROTOCOL_VERSION } from './human-baselines.mjs';
import { HUMAN_BASELINE_PACKET_VERSION } from './human-baseline-plan.mjs';

export const HUMAN_BASELINE_SESSION_KIT_VERSION = 'human_baseline_session_kits_v1';

const FORBIDDEN_PRIVATE_CONTENT_RE = /\bvalidatorBundleHash\b|\bprivate validator\b.*\btrue\b|\bhidden answer\b|\banswer key\b/i;
const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

export function buildHumanBaselineSessionKits(
  packetDocument,
  { generatedAt = new Date().toISOString(), outputDir = 'results/human-baseline-kits' } = {}
) {
  const errors = validatePacketDocument(packetDocument);
  if (errors.length) {
    return { ok: false, errors, warnings: [], kitDocument: null };
  }

  const kits = packetDocument.packets.map((packet) => {
    const markdown = renderHumanBaselineSessionKit(packet);
    const fileName = `${safeFileName(packet.packet_id)}.md`;
    return {
      kit_id: packet.packet_id,
      packet_id: packet.packet_id,
      world_id: packet.world_id,
      domain: packet.domain ?? null,
      slot: packet.slot,
      status: packet.status,
      assignee_id: packet.assignee_id ?? null,
      required_expertise: packet.required_expertise,
      due_at: packet.due_at ?? null,
      blind_review_required: packet.blind_review_required === true,
      private_validator_access: packet.private_validator_access === true,
      file_path: `${outputDir.replace(/\/+$/g, '')}/${fileName}`,
      content_sha256: sha256(markdown),
      markdown,
    };
  });

  const kitDocument = {
    kit_version: HUMAN_BASELINE_SESSION_KIT_VERSION,
    source_packet_version: packetDocument.packet_version,
    protocol_version: packetDocument.protocol_version,
    release_id: packetDocument.release_id ?? null,
    generated_at: generatedAt,
    source_packet_generated_at: packetDocument.generated_at,
    output_dir: outputDir,
    summary: summarizeKits(kits),
    kits,
  };

  const validation = validateHumanBaselineSessionKits(kitDocument, { strict: true });
  return {
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
    kitDocument,
  };
}

export function validateHumanBaselineSessionKits(kitDocument, { strict = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(kitDocument)) {
    return invalid({ strict, errors: ['human baseline session kit document must be an object.'], warnings });
  }
  if (kitDocument.kit_version !== HUMAN_BASELINE_SESSION_KIT_VERSION) {
    errors.push(`kit_version must be ${HUMAN_BASELINE_SESSION_KIT_VERSION}.`);
  }
  if (kitDocument.source_packet_version !== HUMAN_BASELINE_PACKET_VERSION) {
    errors.push(`source_packet_version must be ${HUMAN_BASELINE_PACKET_VERSION}.`);
  }
  if (kitDocument.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}.`);
  }
  if (!isIso(kitDocument.generated_at)) errors.push('generated_at must be an ISO timestamp.');
  if (!nonEmpty(kitDocument.output_dir)) errors.push('output_dir is required.');
  const kits = Array.isArray(kitDocument.kits) ? kitDocument.kits : [];
  if (!Array.isArray(kitDocument.kits) || kits.length === 0) errors.push('kits must be a non-empty array.');

  const ids = new Set();
  for (const [index, kit] of kits.entries()) {
    validateKit({ kit, index, ids, errors, warnings, strict });
  }

  const computedSummary = summarizeKits(kits);
  validateSummary({ declared: kitDocument.summary, computed: computedSummary, errors });
  if (computedSummary.unassigned_kits > 0) {
    warnings.push(`${computedSummary.unassigned_kits} kits are recruiting kits, not executable assigned sessions.`);
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'human_baseline_session_kits_valid' : 'human_baseline_session_kits_invalid',
    summary: computedSummary,
    errors,
    warnings,
  };
}

export function renderHumanBaselineSessionKit(packet) {
  const assignee = packet.assignee_id ? packet.assignee_id : 'unassigned';
  const dueAt = packet.due_at ?? 'to be scheduled';
  const statusNote =
    packet.status === 'unassigned'
      ? 'This slot is not assigned yet. Use this kit as a recruiting and screening brief until an expert is selected.'
      : 'This slot is assigned. Send only this kit and the session world access to the participant.';

  return [
    `# Human Baseline Session Kit: ${packet.packet_id}`,
    '',
    `Protocol: ${packet.protocol_version}`,
    `Release: ${packet.release_id ?? 'not set'}`,
    `World: ${packet.world_id}`,
    `Domain: ${packet.domain ?? 'not set'}`,
    `Slot: ${packet.slot}`,
    `Status: ${packet.status}`,
    `Assignee: ${assignee}`,
    `Required Expertise: ${packet.required_expertise}`,
    `Due: ${dueAt}`,
    '',
    '## Purpose',
    '',
    'This is a timed expert baseline session for OrgX-Bench. The goal is to measure real human work against the same world contract used for model runs.',
    statusNote,
    '',
    '## Consent And Eligibility Checklist',
    '',
    '- Compensation and expected time budget have been disclosed before the session starts.',
    '- Participant confirms they are not an OrgX employee or benchmark builder.',
    '- Participant confirms they have not seen this private holdout world, private validators, hidden answers, or grader output.',
    '- Participant consents to hashed, non-identifying aggregate reporting of timing, success, confidence, and ambiguity notes.',
    '- Participant understands that raw identity and payment records stay outside the public benchmark artifact.',
    '',
    '## Session Rules',
    '',
    '- Use only the session world access and allowed tools provided by the benchmark operator.',
    '- Do not inspect private validators, hidden answers, grader output, model outputs, or other participants artifacts before submitting.',
    '- Start the timer only after the world instructions and allowed tool surface are available.',
    '- Stop the timer when the final artifact and receipt are submitted.',
    '- Record uncertainty honestly; a failed or ambiguous run is still useful evidence.',
    '',
    '## Required Outputs',
    '',
    '- Final work artifact for the world task.',
    '- Session receipt with visible actions, timestamps, files inspected, decisions requested or created, checks run, citations used, confidence, and ambiguity notes.',
    '- `artifact_hash`, `receipt_hash`, and `operator_profile_hash` as `sha256:<64-hex>` values.',
    '- `started_at`, `completed_at`, `blind_review_recorded_at`, and `grader_verdict_revealed_at` timestamps.',
    '',
    '## Recording Command',
    '',
    '```bash',
    packet.record_command_template,
    '```',
    '',
    '## Operator Notes',
    '',
    '- Keep private validators and private solution materials out of this kit and out of the participant workspace.',
    '- Keep payment/identity records separate from public benchmark files.',
    '- After the session, run `npm run validate:human-baselines -- --allow-incomplete` to confirm the receipt shape before release gating.',
    '',
  ].join('\n');
}

function validatePacketDocument(packetDocument) {
  const errors = [];
  if (!isRecord(packetDocument)) {
    errors.push('packet document must be an object.');
    return errors;
  }
  if (packetDocument.packet_version !== HUMAN_BASELINE_PACKET_VERSION) {
    errors.push(`packet_version must be ${HUMAN_BASELINE_PACKET_VERSION}.`);
  }
  if (packetDocument.protocol_version !== HUMAN_BASELINE_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${HUMAN_BASELINE_PROTOCOL_VERSION}.`);
  }
  if (!Array.isArray(packetDocument.packets) || packetDocument.packets.length === 0) {
    errors.push('packets must be a non-empty array.');
  }
  return errors;
}

function validateKit({ kit, index, ids, errors, warnings, strict }) {
  const prefix = `kits[${index}]`;
  if (!isRecord(kit)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(kit.kit_id)) errors.push(`${prefix}.kit_id is required.`);
  else if (ids.has(kit.kit_id)) errors.push(`${prefix}.kit_id ${kit.kit_id} is duplicated.`);
  else ids.add(kit.kit_id);
  if (!nonEmpty(kit.packet_id)) errors.push(`${prefix}.packet_id is required.`);
  if (!nonEmpty(kit.world_id)) errors.push(`${prefix}.world_id is required.`);
  if (!Number.isInteger(kit.slot) || kit.slot < 1) errors.push(`${prefix}.slot must be a positive integer.`);
  if (!['assigned', 'unassigned', 'completed'].includes(kit.status)) errors.push(`${prefix}.status is invalid.`);
  if (kit.blind_review_required !== true) errors.push(`${prefix}.blind_review_required must be true.`);
  if (kit.private_validator_access !== false) errors.push(`${prefix}.private_validator_access must be false.`);
  if (!nonEmpty(kit.file_path) || !kit.file_path.endsWith('.md')) errors.push(`${prefix}.file_path must be a markdown path.`);
  if (!isSha256(kit.content_sha256)) errors.push(`${prefix}.content_sha256 must be sha256:<64 hex>.`);
  if (!nonEmpty(kit.markdown)) errors.push(`${prefix}.markdown is required.`);
  if (nonEmpty(kit.markdown) && sha256(kit.markdown) !== kit.content_sha256) {
    errors.push(`${prefix}.content_sha256 does not match markdown.`);
  }
  if (FORBIDDEN_PRIVATE_CONTENT_RE.test(kit.markdown ?? '')) {
    errors.push(`${prefix}.markdown contains private-validator or answer-key leakage.`);
  }
  if (strict && kit.status === 'assigned' && !nonEmpty(kit.assignee_id)) {
    errors.push(`${prefix}.assignee_id is required for assigned kits.`);
  }
}

function summarizeKits(kits) {
  return {
    kits: kits.length,
    assigned_kits: kits.filter((kit) => kit.status === 'assigned').length,
    unassigned_kits: kits.filter((kit) => kit.status === 'unassigned').length,
    completed_kits: kits.filter((kit) => kit.status === 'completed').length,
    private_validator_access_count: kits.filter((kit) => kit.private_validator_access === true).length,
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

function safeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function invalid({ strict, errors, warnings }) {
  return {
    ok: false,
    strict,
    status: 'human_baseline_session_kits_invalid',
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
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isSha256(value) {
  return typeof value === 'string' && SHA_256_RE.test(value);
}
