#!/usr/bin/env node
import { auditRepositoryPrompts } from './lib/prompt-audit.mjs';

const result = await auditRepositoryPrompts();

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      sourceCount: result.sourceCount,
      findingCount: result.findings.length,
      findings: result.findings,
    },
    null,
    2
  )
);

process.exit(result.ok ? 0 : 1);

