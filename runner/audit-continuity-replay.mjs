#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {auditContinuityLedger} from './lib/continuity-replay.mjs';
const [planPath,ledgerPath,outPath]=process.argv.slice(2);
if(!planPath||!ledgerPath||!outPath)throw new Error('Usage: node runner/audit-continuity-replay.mjs plan.json ledger.json audit.json');
const plan=JSON.parse(await readFile(planPath,'utf8')),ledger=JSON.parse(await readFile(ledgerPath,'utf8'));
const audit=auditContinuityLedger(plan,ledger);await mkdir(path.dirname(outPath),{recursive:true});await writeFile(outPath,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({ok:audit.ok,episodes:audit.episodes,replayed:audit.replayed,observed_cost_usd:audit.observed_cost_usd,errors:audit.errors}));if(!audit.ok)process.exitCode=1;
