# AGENTS.md

Guidelines for Codex and other agents working in `useorgx/autonomous-initiative-benchmark`.

## Project

This repo is the public proof surface for the OrgX Autonomous Initiative Benchmark and Initiative Worlds preview.

## Setup

For Codex cloud, use:

```bash
bash .codex/setup-cloud.sh
```

Maintenance script for cached environments:

```bash
bash .codex/maintenance-cloud.sh
```

## Verification

Run the narrowest relevant check for the files you changed:

```bash
npm run validate:worlds:preview
npm run validate:world
npm run validate:bundle
npm run validate:bundle:strict
```

Do not claim benchmark changes are verified unless the relevant validator command ran successfully.
