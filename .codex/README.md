# Codex Cloud Environment

Use these repo-local scripts when configuring the Codex cloud environment for `useorgx/autonomous-initiative-benchmark`.

## Setup script

```bash
bash .codex/setup-cloud.sh
```

## Maintenance script

```bash
bash .codex/maintenance-cloud.sh
```

## Environment notes

- Node 22 or newer is safe for this repository.
- No secrets are required for schema and preview-world validation.
- Keep internet access limited to the setup phase unless a task explicitly needs external services.

## Verification commands

```bash
npm run validate:worlds:preview
npm run validate:bundle
```
