import { performance } from 'node:perf_hooks';

const DEFAULT_PRICING_USD_PER_M = {
  'gpt-5-nano': { input: 0.05, output: 0.4 },
};

export async function runOpenAITask(task, runId, options) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const prompt = buildPrompt(task, options.minArtifactChars, lastError, attempt);
      const response = await createResponse(task, prompt, options);
      const durationSeconds = Number(((performance.now() - started) / 1000).toFixed(2));
      const parsed = parseJsonObject(extractResponseText(response));
      const artifactMarkdown = String(parsed.artifactMarkdown || '').trim();
      const criterionScores = normalizeCriterionScores(task, parsed.criterionScores);
      const qualityScore = scoreCriteria(task.acceptanceCriteria, criterionScores);
      const completeness = clampNumber(parsed.completeness ?? qualityScore / 100, 0, 1);
      const validationError = validateRunResult(response, artifactMarkdown, completeness, qualityScore, options);

      if (validationError) {
        lastError = validationError;
        if (attempt < 3) continue;
        throw new Error(validationError);
      }

      return {
        runId,
        taskId: task.id,
        status: response.status,
        model: options.model,
        provider: 'openai',
        startedAt,
        completedAt: new Date().toISOString(),
        durationSeconds,
        usage: response.usage ?? {},
        costCents: estimateCostCents(options.model, response.usage ?? {}),
        qualityScore,
        completeness,
        autonomousCompleted: true,
        artifactMarkdown,
        criterionScores,
        notes: String(parsed.notes || '').trim(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 3) throw new Error(`${runId} failed after 3 attempts: ${lastError}`);
    }
  }

  throw new Error(`${runId} failed unexpectedly.`);
}

async function createResponse(task, prompt, options) {
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
        model: options.model,
        input: prompt,
        reasoning: { effort: 'minimal' },
        max_output_tokens: options.maxOutputTokens,
        text: { format: buildOutputFormat(task) },
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

function buildPrompt(task, minArtifactChars, lastError, attempt) {
  const criteria = task.acceptanceCriteria
    .map((criterion) => `- ${criterion.id} (${criterion.weight}): ${criterion.description}`)
    .join('\n');

  return [
    'You are completing one public autonomous initiative benchmark task.',
    'Return JSON only. Do not wrap it in markdown.',
    'The JSON shape must be:',
    '{"artifactMarkdown":"...","criterionScores":{"criterion-id":0.0},"completeness":0.0,"notes":"..."}',
    'Criterion scores must be numbers from 0 to 1. completeness must be 0 to 1.',
    `artifactMarkdown must contain the complete finished artifact in Markdown, at least ${minArtifactChars} characters.`,
    'notes must be a brief note about scoring only. Do not put the artifact in notes.',
    attempt > 1 ? `Previous attempt was rejected: ${lastError}` : '',
    '',
    `Task id: ${task.id}`,
    `Task name: ${task.name}`,
    `Domain: ${task.domain}`,
    '',
    'Acceptance criteria:',
    criteria,
    '',
    'User prompt:',
    task.rawPrompt,
  ].join('\n');
}

function buildOutputFormat(task) {
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
  if (qualityScore <= 0) return 'criterion scores produced a zero quality score';
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

function normalizeCriterionScores(task, scores) {
  const result = {};
  for (const criterion of task.acceptanceCriteria) {
    result[criterion.id] = clampNumber(Number(scores?.[criterion.id] ?? 0), 0, 1);
  }
  return result;
}

function scoreCriteria(criteria, scores) {
  const totalWeight = sum(criteria.map((criterion) => Number(criterion.weight ?? 1)));
  if (!totalWeight) return 0;
  const weighted = sum(
    criteria.map((criterion) => Number(criterion.weight ?? 1) * Number(scores[criterion.id] ?? 0))
  );
  return Number(((weighted / totalWeight) * 100).toFixed(2));
}

function estimateCostCents(modelName, usage) {
  const pricing = DEFAULT_PRICING_USD_PER_M[modelName];
  if (!pricing) return null;
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const usd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return Number((usd * 100).toFixed(4));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}
