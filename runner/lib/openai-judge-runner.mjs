import { performance } from 'node:perf_hooks';

import { estimateCostCents } from './openai-pricing.mjs';
import {
  chatReasoningFields,
  chatUsageCostCents,
  getProvider,
  normalizeAnthropicUsage,
  normalizeChatUsage,
  providerHeaders,
  requireProviderKey,
} from './providers.mjs';
import { clampNumber, normalizeCriterionScores, scoreCriteria } from './scoring.mjs';

const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 750;

export async function runOpenAIJudge({ task, result, judgeSpec, judgeId, options }) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildJudgePrompt(task, result, lastError, attempt);
      const response = await createJudgeResponse(prompt, judgeSpec, options);
      const parsed = parseJsonObject(extractResponseText(response));
      const criterionScores = normalizeCriterionScores(task, parsed.criterionScores);
      const qualityScore = scoreCriteria(task.acceptanceCriteria, criterionScores);
      const completeness = clampNumber(Number(parsed.completeness), 0, 1);
      const confidence = clampNumber(Number(parsed.confidence), 0, 1);
      const rationale = String(parsed.rationale || '').trim();
      const redFlags = Array.isArray(parsed.redFlags)
        ? parsed.redFlags.map((flag) => String(flag).trim()).filter(Boolean)
        : [];

      if (!rationale) {
        lastError = 'judge rationale was empty';
        if (attempt < MAX_ATTEMPTS) continue;
        throw new Error(lastError);
      }

      return {
        judgeId,
        taskId: task.id,
        runId: result.runId,
        provider: judgeSpec.provider ?? 'openai',
        model: judgeSpec.model,
        reasoningEffort: judgeSpec.reasoningEffort,
        status: response.status,
        startedAt,
        completedAt: new Date().toISOString(),
        durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
        usage: response.usage ?? {},
        costCents: response.costCents ?? estimateCostCents(judgeSpec.model, response.usage ?? {}),
        qualityScore,
        completeness,
        criterionScores,
        confidence,
        rationale,
        redFlags,
        humanReviewRecommended: Boolean(parsed.humanReviewRecommended),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) {
        return {
          judgeId,
          taskId: task.id,
          runId: result.runId,
          provider: judgeSpec.provider ?? 'openai',
          model: judgeSpec.model,
          reasoningEffort: judgeSpec.reasoningEffort,
          status: 'failed',
          startedAt,
          completedAt: new Date().toISOString(),
          durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
          usage: {},
          costCents: 0,
          qualityScore: 0,
          completeness: 0,
          criterionScores: normalizeCriterionScores(task, {}),
          confidence: 0,
          rationale: '',
          redFlags: [lastError],
          humanReviewRecommended: true,
        };
      }
      await sleep(retryDelayMs(attempt));
    }
  }
}

function retryDelayMs(attempt) {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createJudgeResponse(prompt, judgeSpec, options) {
  const providerName = judgeSpec.provider ?? 'openai';
  const provider = getProvider(providerName);
  const apiKey = requireProviderKey(providerName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  const payload =
    provider.api === 'responses'
      ? {
          model: judgeSpec.model,
          input: prompt,
          reasoning: { effort: judgeSpec.reasoningEffort },
          max_output_tokens: options.maxOutputTokens,
          text: { format: buildJudgeOutputFormat(options.criterionIds) },
        }
      : provider.api === 'anthropic_messages'
      ? {
          model: judgeSpec.model,
          max_tokens: options.maxOutputTokens,
          messages: [
            {
              role: 'user',
              content: `${prompt}\n\n${buildChatShapeHint(options.criterionIds)}`,
            },
          ],
        }
      : {
          model: judgeSpec.model,
          // json_object mode does not enforce a schema, so the expected shape
          // rides along in the prompt for chat providers.
          messages: [{ role: 'user', content: `${prompt}\n\n${buildChatShapeHint(options.criterionIds)}` }],
          response_format: { type: 'json_object' },
          ...chatReasoningFields(provider, judgeSpec.reasoningEffort),
          max_tokens: options.maxOutputTokens,
        };

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: providerHeaders(provider, apiKey),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${providerName} API ${response.status}: ${body.slice(0, 1000)}`);
    }

    const parsed = JSON.parse(body);
    if (provider.api === 'responses') return parsed;
    if (provider.api === 'anthropic_messages') return normalizeAnthropicJudgeResponse(parsed);
    return normalizeChatResponse(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAnthropicJudgeResponse(response) {
  const content = (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
  if (!content.trim()) {
    throw new Error(`anthropic judge returned empty content (stop_reason: ${response.stop_reason ?? 'unknown'})`);
  }
  return {
    status: 'completed',
    output_text: content,
    usage: normalizeAnthropicUsage(response.usage ?? {}),
    costCents: null,
  };
}

function buildChatShapeHint(criterionIds) {
  const scoreKeys = criterionIds.map((criterionId) => `"${criterionId}": 0.0`).join(', ');
  return [
    'Respond with a single JSON object of exactly this shape:',
    `{"criterionScores": {${scoreKeys}}, "completeness": 0.0, "confidence": 0.0, "rationale": "...", "redFlags": [], "humanReviewRecommended": false}`,
  ].join('\n');
}

// Chat-completions response -> the subset of the Responses API shape the rest
// of this module reads (status, output_text, usage, costCents).
function normalizeChatResponse(response) {
  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';
  if (!content.trim()) {
    throw new Error(
      `chat judge returned empty content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`
    );
  }
  return {
    status: 'completed',
    output_text: content,
    usage: normalizeChatUsage(response.usage ?? {}),
    costCents: chatUsageCostCents(response.usage ?? {}),
  };
}

function buildJudgePrompt(task, result, lastError, attempt) {
  const criteria = (task.acceptanceCriteria ?? [])
    .map((criterion) => `- ${criterion.id} (${criterion.weight}): ${criterion.description}`)
    .join('\n');

  // Strict protocol for hard-tier tasks: criteria reference planted ground
  // truth the generator never saw. The judge verifies detection and arithmetic
  // adversarially instead of rewarding plausible coverage.
  const strict = task.judgingProtocol === 'strict';
  const instructions = strict
    ? [
        'You are an adversarial benchmark judge for a hard-tier task. You did not generate the artifact.',
        'The acceptance criteria below reference HIDDEN GROUND TRUTH (planted facts, traps, and required computations) that the generator was never shown.',
        'For each criterion, verify the specific detection or computation yourself before scoring. Recompute every number.',
        'Scoring discipline per criterion:',
        '- 1.0 only when the artifact makes the exact required finding or computation, explicitly and correctly.',
        '- 0.5 when it identifies the issue but with materially wrong numbers, hedged framing, or without evidence.',
        '- 0.2 when it gestures at the area without the actual finding.',
        '- 0.0 when it misses the issue, asserts the wrong narrative, or repeats a planted false claim.',
        'Fluent, well-structured prose that misses the hidden findings MUST score near zero on those criteria. Do not grade on coverage, formatting, or confidence.',
        'In redFlags, list every planted false claim the artifact repeated and every wrong number it asserted.',
      ]
    : [
        'You are an independent benchmark judge. You did not generate the artifact.',
        'Judge only the artifact against the provided task prompt and acceptance criteria.',
        'Do not reward confident wording, length, or generic polish unless it satisfies a criterion.',
        'Score each criterion from 0 to 1. Use 0.5 for partially correct, 0.8 for strong, and 1.0 only for excellent, concrete satisfaction.',
      ];

  return [
    ...instructions,
    'Return JSON only. Do not wrap it in markdown.',
    attempt > 1 ? `Previous judging attempt was rejected: ${lastError}` : '',
    '',
    `Task id: ${task.id}`,
    `Task name: ${task.name}`,
    `Domain: ${task.domain}`,
    '',
    'Original user prompt:',
    task.rawPrompt || task.description,
    '',
    strict ? 'Acceptance criteria (hidden ground truth — verify each one yourself):' : 'Acceptance criteria:',
    criteria,
    '',
    'Artifact to judge:',
    result.artifactMarkdown,
  ].join('\n');
}

function buildJudgeOutputFormat(criterionIds) {
  const criterionScoreProperties = Object.fromEntries(
    criterionIds.map((criterionId) => [criterionId, { type: 'number' }])
  );

  return {
    type: 'json_schema',
    name: 'benchmark_judgment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        criterionScores: {
          type: 'object',
          additionalProperties: false,
          properties: criterionScoreProperties,
          required: Object.keys(criterionScoreProperties),
        },
        completeness: { type: 'number' },
        confidence: { type: 'number' },
        rationale: { type: 'string' },
        redFlags: {
          type: 'array',
          items: { type: 'string' },
        },
        humanReviewRecommended: { type: 'boolean' },
      },
      required: [
        'criterionScores',
        'completeness',
        'confidence',
        'rationale',
        'redFlags',
        'humanReviewRecommended',
      ],
    },
  };
}

function extractResponseText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function parseJsonObject(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Judge did not return parseable JSON: ${cleaned.slice(0, 500)}`);
  }
}
