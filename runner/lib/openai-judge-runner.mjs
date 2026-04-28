import { performance } from 'node:perf_hooks';

import { estimateCostCents } from './openai-pricing.mjs';
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
        provider: 'openai',
        model: judgeSpec.model,
        reasoningEffort: judgeSpec.reasoningEffort,
        status: response.status,
        startedAt,
        completedAt: new Date().toISOString(),
        durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
        usage: response.usage ?? {},
        costCents: estimateCostCents(judgeSpec.model, response.usage ?? {}),
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
          provider: 'openai',
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: judgeSpec.model,
        input: prompt,
        reasoning: { effort: judgeSpec.reasoningEffort },
        max_output_tokens: options.maxOutputTokens,
        text: { format: buildJudgeOutputFormat(options.criterionIds) },
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 1000)}`);
    }

    return JSON.parse(body);
  } finally {
    clearTimeout(timeout);
  }
}

function buildJudgePrompt(task, result, lastError, attempt) {
  const criteria = (task.acceptanceCriteria ?? [])
    .map((criterion) => `- ${criterion.id} (${criterion.weight}): ${criterion.description}`)
    .join('\n');

  return [
    'You are an independent benchmark judge. You did not generate the artifact.',
    'Judge only the artifact against the provided task prompt and acceptance criteria.',
    'Do not reward confident wording, length, or generic polish unless it satisfies a criterion.',
    'Score each criterion from 0 to 1. Use 0.5 for partially correct, 0.8 for strong, and 1.0 only for excellent, concrete satisfaction.',
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
    'Acceptance criteria:',
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
