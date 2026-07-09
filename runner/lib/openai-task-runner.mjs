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

export const HIDDEN_CRITERIA_GENERATOR_NOTE =
  'This task is scored by independent judges against undisclosed criteria. Do the work to a senior practitioner standard.';

export async function runOpenAITask(task, runId, options) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildPrompt(task, options.minArtifactChars, lastError, attempt);
      const response = await createResponse(task, prompt, options);
      const durationSeconds = Number(((performance.now() - started) / 1000).toFixed(2));
      const parsed = parseJsonObject(extractResponseText(response));
      const hidden = task.hideCriteriaFromGenerator === true;
      const artifactMarkdown = String(parsed.artifactMarkdown || '').trim();
      const criterionScores = normalizeCriterionScores(task, parsed.criterionScores);
      const qualityScore = hidden ? 0 : scoreCriteria(task.acceptanceCriteria, criterionScores);
      const completeness = clampNumber(parsed.completeness ?? qualityScore / 100, 0, 1);
      const validationError = validateRunResult(response, artifactMarkdown, completeness, qualityScore, {
        ...options,
        skipCriterionCheck: hidden,
      });

      if (validationError) {
        lastError = validationError;
        if (attempt < MAX_ATTEMPTS) continue;
        throw new Error(validationError);
      }

      return {
        runId,
        taskId: task.id,
        status: response.status,
        model: options.model,
        provider: options.provider ?? 'openai',
        startedAt,
        completedAt: new Date().toISOString(),
        durationSeconds,
        usage: response.usage ?? {},
        costCents: response.costCents ?? estimateCostCents(options.model, response.usage ?? {}),
        qualityScore,
        completeness,
        autonomousCompleted: true,
        artifactMarkdown,
        criterionScores,
        selfReportedQualityScore: qualityScore,
        selfReportedCompleteness: completeness,
        selfReportedCriterionScores: criterionScores,
        scoringSource: 'self_reported',
        notes: String(parsed.notes || '').trim(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) throw new Error(`${runId} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
      await sleep(retryDelayMs(attempt));
    }
  }

  throw new Error(`${runId} failed unexpectedly.`);
}

function retryDelayMs(attempt) {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createResponse(task, prompt, options) {
  const providerName = options.provider ?? 'openai';
  const provider = getProvider(providerName);
  const apiKey = requireProviderKey(providerName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  const payload =
    provider.api === 'responses'
      ? {
          model: options.model,
          input: prompt,
          reasoning: { effort: options.reasoningEffort ?? 'minimal' },
          max_output_tokens: options.maxOutputTokens,
          text: { format: buildOutputFormat(task) },
        }
      : provider.api === 'anthropic_messages'
      ? {
          model: options.model,
          max_tokens: options.maxOutputTokens,
          messages: [{ role: 'user', content: prompt }],
        }
      : {
          model: options.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          ...chatReasoningFields(provider, options.reasoningEffort ?? 'low'),
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
    if (provider.api === 'anthropic_messages') return normalizeAnthropicTextResponse(parsed);
    return normalizeChatResponse(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAnthropicTextResponse(response) {
  const content = (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
  if (!content.trim()) {
    throw new Error(`anthropic generation returned empty content (stop_reason: ${response.stop_reason ?? 'unknown'})`);
  }
  return {
    status: 'completed',
    output_text: content,
    usage: normalizeAnthropicUsage(response.usage ?? {}),
    costCents: null,
  };
}

// Chat-completions response -> the subset of the Responses API shape this
// module reads (status, output_text, usage, costCents).
function normalizeChatResponse(response) {
  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';
  if (!content.trim()) {
    throw new Error(
      `chat generation returned empty content (finish_reason: ${choice?.finish_reason ?? 'unknown'})`
    );
  }
  return {
    status: 'completed',
    output_text: content,
    usage: normalizeChatUsage(response.usage ?? {}),
    costCents: chatUsageCostCents(response.usage ?? {}),
  };
}

function buildPrompt(task, minArtifactChars, lastError, attempt) {
  // Hard-tier tasks withhold acceptance criteria: the benchmark measures
  // whether the system catches the planted issues unprompted, so the criteria
  // (which reference hidden ground truth) must not leak into generation.
  const hidden = task.hideCriteriaFromGenerator === true;
  const criteria = hidden
    ? null
    : task.acceptanceCriteria
        .map((criterion) => `- ${criterion.id} (${criterion.weight}): ${criterion.description}`)
        .join('\n');

  return [
    'You are completing one public autonomous initiative benchmark task.',
    'Return JSON only. Do not wrap it in markdown.',
    'The JSON shape must be:',
    hidden
      ? '{"artifactMarkdown":"...","completeness":0.0,"notes":"..."}'
      : '{"artifactMarkdown":"...","criterionScores":{"criterion-id":0.0},"completeness":0.0,"notes":"..."}',
    hidden
      ? 'completeness must be 0 to 1.'
      : 'Criterion scores must be numbers from 0 to 1. completeness must be 0 to 1.',
    `artifactMarkdown must contain the complete finished artifact in Markdown, at least ${minArtifactChars} characters.`,
    'notes must be a brief note about scoring only. Do not put the artifact in notes.',
    hidden ? HIDDEN_CRITERIA_GENERATOR_NOTE : '',
    attempt > 1 ? `Previous attempt was rejected: ${lastError}` : '',
    '',
    `Task id: ${task.id}`,
    `Task name: ${task.name}`,
    `Domain: ${task.domain}`,
    '',
    ...(hidden ? [] : ['Acceptance criteria:', criteria, '']),
    'User prompt:',
    task.rawPrompt,
  ].join('\n');
}

function buildOutputFormat(task) {
  if (task.hideCriteriaFromGenerator === true) {
    return {
      type: 'json_schema',
      name: 'benchmark_output',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          artifactMarkdown: { type: 'string' },
          completeness: { type: 'number' },
          notes: { type: 'string' },
        },
        required: ['artifactMarkdown', 'completeness', 'notes'],
      },
    };
  }

  const criterionScoreProperties = Object.fromEntries(
    task.acceptanceCriteria.map((criterion) => [criterion.id, { type: 'number' }])
  );

  return {
    type: 'json_schema',
    name: 'benchmark_output',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactMarkdown: { type: 'string' },
        criterionScores: {
          type: 'object',
          additionalProperties: false,
          properties: criterionScoreProperties,
          required: Object.keys(criterionScoreProperties),
        },
        completeness: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['artifactMarkdown', 'criterionScores', 'completeness', 'notes'],
    },
  };
}

function validateRunResult(response, artifactMarkdown, completeness, qualityScore, options) {
  if (response.status !== 'completed') return `response status was ${response.status}`;
  if (artifactMarkdown.length < options.minArtifactChars) {
    return `artifactMarkdown was too short (${artifactMarkdown.length} chars, minimum ${options.minArtifactChars})`;
  }
  if (completeness < 0.7) return `completeness was below threshold (${completeness})`;
  if (!options.skipCriterionCheck && qualityScore <= 0) {
    return 'criterion scores produced a zero quality score';
  }
  return null;
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
    throw new Error(`Model did not return parseable JSON: ${cleaned.slice(0, 500)}`);
  }
}
