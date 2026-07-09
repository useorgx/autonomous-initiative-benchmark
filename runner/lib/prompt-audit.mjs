import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { HIDDEN_CRITERIA_GENERATOR_NOTE } from './openai-task-runner.mjs';
import { parseSimpleYaml } from './simple-yaml.mjs';
import { BASE_SYSTEM, ORGX3_SYSTEM, ORGX_SYSTEM } from './world-engine.mjs';

export const METHOD_HINT_RULES = [
  {
    id: 'answer_location_hint',
    pattern: /\banswer is not in the prompt\b/i,
    description: 'Do not tell the model where the answer is or is not.',
  },
  {
    id: 'mandatory_tool_method',
    pattern: /\bmust use (?:the )?tools\b/i,
    description: 'Do not force a specific tool-use strategy in shared prompts.',
  },
  {
    id: 'gather_every_fact',
    pattern: /\bgather every fact\b/i,
    description: 'Do not coach exhaustive fact-gathering as the benchmark method.',
  },
  {
    id: 'verify_every_number',
    pattern: /\bverify every (?:number|claim|field|fact|value)s?\b/i,
    description: 'Do not tell the model which verification behavior the benchmark wants.',
  },
  {
    id: 'decompose_first',
    pattern: /\bdecompose first\b/i,
    description: 'Decomposition is an arm/control-plane behavior, not a world prompt hint.',
  },
  {
    id: 'dependency_order',
    pattern: /\bdependency order\b/i,
    description: 'Do not reveal dependency-ordering as the intended method.',
  },
  {
    id: 'which_result_feeds_which',
    pattern: /which result feeds which/i,
    description: 'Do not name the dependency-analysis tactic in prompts.',
  },
  {
    id: 'rederive',
    pattern: /\bre-?derive\b/i,
    description: 'Re-derivation is a hidden control-plane/evaluator behavior, not prompt text.',
  },
  {
    id: 'requery',
    pattern: /\bre-?query\b/i,
    description: 'Do not prescribe re-querying as the benchmark method.',
  },
  {
    id: 'recompute',
    pattern: /\brecompute\b/i,
    description: 'Do not prescribe recomputation as the benchmark method.',
  },
  {
    id: 'before_finalizing',
    pattern: /\bbefore finaliz(?:e|ing)\b/i,
    description: 'Do not disclose the finalize-time verification strategy.',
  },
  {
    id: 'check_your_work',
    pattern: /\bcheck your work\b/i,
    description: 'Generic self-check prompting belongs in explicit control arms only.',
  },
  {
    id: 'single_source_warning',
    pattern: /do not trust a single source/i,
    description: 'Do not name the planted single-source trap.',
  },
  {
    id: 'cross_check',
    pattern: /\bcross-?check\b/i,
    description: 'Do not tell the model to cross-check hidden trust traps.',
  },
  {
    id: 'system_of_record_solution_hint',
    pattern: /\bsystem of record\b/i,
    description: 'Do not reveal source-precedence solution hints in task prompts.',
  },
  {
    id: 'authoritative_solution_hint',
    pattern: /\bauthoritative (?:one|source|record|value)\b/i,
    description: 'Do not reveal source-authority solution hints in task prompts.',
  },
];

export function auditPromptText({ source, text, rules = METHOD_HINT_RULES }) {
  const body = String(text ?? '');
  const findings = [];
  for (const rule of rules) {
    const match = body.match(rule.pattern);
    if (!match) continue;
    findings.push({
      source,
      ruleId: rule.id,
      description: rule.description,
      match: match[0],
      snippet: snippet(body, match.index ?? 0, match[0].length),
    });
  }
  return findings;
}

export async function auditRepositoryPrompts({ repoRoot = path.resolve(import.meta.dirname, '..', '..') } = {}) {
  const sources = await collectPromptSources({ repoRoot });
  const findings = sources.flatMap((source) => auditPromptText(source));
  return {
    ok: findings.length === 0,
    sourceCount: sources.length,
    findings,
  };
}

export async function collectPromptSources({ repoRoot = path.resolve(import.meta.dirname, '..', '..') } = {}) {
  const sources = [
    { source: 'runner/lib/world-engine.mjs#BASE_SYSTEM', text: BASE_SYSTEM },
    { source: 'runner/lib/world-engine.mjs#ORGX_SYSTEM', text: ORGX_SYSTEM },
    { source: 'runner/lib/world-engine.mjs#ORGX3_SYSTEM', text: ORGX3_SYSTEM },
    { source: 'runner/lib/openai-task-runner.mjs#HIDDEN_CRITERIA_GENERATOR_NOTE', text: HIDDEN_CRITERIA_GENERATOR_NOTE },
  ];

  for (const file of await instrumentedWorldFiles(repoRoot)) {
    const module = await import(pathToFileURL(file).href);
    if (typeof module.world?.prompt === 'string') {
      sources.push({
        source: path.relative(repoRoot, file) + '#world.prompt',
        text: module.world.prompt,
      });
    }
  }

  for (const file of await worldYamlFiles(path.join(repoRoot, 'worlds'))) {
    const world = parseSimpleYaml(await readFile(file, 'utf8'));
    const relative = path.relative(repoRoot, file);
    for (const field of ['goal', 'agentInstruction']) {
      if (typeof world[field] === 'string') {
        sources.push({ source: `${relative}#${field}`, text: world[field] });
      }
    }
    if (Array.isArray(world.constraints)) {
      sources.push({
        source: `${relative}#constraints`,
        text: world.constraints.join('\n'),
      });
    }
  }

  return sources;
}

async function instrumentedWorldFiles(repoRoot) {
  const dir = path.join(repoRoot, 'worlds', 'instrumented');
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

async function worldYamlFiles(root) {
  const out = [];
  await walk(root, out);
  return out.sort();
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(file, out);
    } else if (entry.isFile() && entry.name === 'world.yaml') {
      out.push(file);
    }
  }
}

function snippet(text, index, length) {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim();
}

