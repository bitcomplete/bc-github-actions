# AGENTS.md

Onboarding map for AI coding agents working in this repo. Links, not duplication — read the target docs instead of treating this file as the source of truth.

## What this repo is

Reusable GitHub Actions for Claude Code plugin marketplace automation: discovery, validation, marketplace.json generation, PR creation + auto-merge, and reliability workarounds.

- Business overview and quick start: [README.md](README.md)
- End-user action reference: [agentic-marketplace/README.md](agentic-marketplace/README.md)
- Reference consumer using these actions: [bitcomplete/bc-agentic-marketplace](https://github.com/bitcomplete/bc-agentic-marketplace)

## Start here, in this order

1. [README.md](README.md) — what the repo does and how it's used downstream.
2. [agentic-marketplace/README.md](agentic-marketplace/README.md) — per-action inputs, outputs, config surface. The authoritative reference.
3. The README for the specific action you're changing, if any:
   - [discover](agentic-marketplace/discover/action.yml)
   - [validate](agentic-marketplace/validate/action.yml)
   - [generate](agentic-marketplace/generate/action.yml)
   - [publish](agentic-marketplace/publish/action.yml)
   - [heal-stuck-prs](agentic-marketplace/heal-stuck-prs/README.md) — reliability-only workaround, read its "why" section before touching.
4. The reference consumer's [AGENTS.md](https://github.com/bitcomplete/bc-agentic-marketplace/blob/main/AGENTS.md) — style conventions, writing guidance, and skill-authoring tips that apply here too.

## Where things live

| Thing | Path |
|---|---|
| Composite action definitions | `agentic-marketplace/<name>/action.yml` |
| Reusable workflows | `.github/workflows/*.yml` |
| Discovery logic (source) | `scripts/src/discover-components.js` |
| Bundled runtime (consumed by actions) | `scripts/dist/discover-components.cjs` |
| Tests | `scripts/test/discover-components.test.js` |
| Fixtures | `test-fixtures/valid/`, `test-fixtures/invalid/` |
| Starter templates for consumer repos | `templates/` |

## Working loop

1. Edit source in `scripts/src/` or an action YAML.
2. `npm test` — full suite must stay green.
3. `npm run build` — rebuilds `scripts/dist/`. **Always commit src + dist together.**
4. For inline bash in action YAMLs, run `shellcheck -s bash` against the extracted run block.

## Architecture at a glance

- **Hybrid**: composite actions (one job, one concern) + reusable workflows (orchestrate actions, handle secrets).
- **Bundled runtime**: discovery logic is a single Node.js file bundled with esbuild so consumer workflows don't run `npm install`.
- **Discovery is excludes-only**: anywhere under the repo root is in scope unless filtered by `excludeDirs` / `excludePatterns`. There is no include list — see [agentic-marketplace/README.md § Discovery Process](agentic-marketplace/README.md#discovery-process).
- **One shared pipeline**: validate and generate consume the output of `discoverAllComponents` → `groupIntoPlugins`. A component that passes validate must appear in generate — divergence is structurally impossible. Orphans (anything not under `<category>/<plugin-name>/`) fail both stages.

## Internal SHA pinning

Reusable workflows reference their companion composite actions by SHA, not by `@v1`. This is deliberate: when a consumer pins the reusable workflow to a SHA, every transitive `uses:` inside it resolves at a consistent commit.

If you modify an action referenced by a reusable workflow, **update the SHA in the workflow file in the same commit** — otherwise the workflow silently keeps consuming the old action.

## Releasing

1. Merge your PR to `main`.
2. `git tag vX.Y.Z` from `main` and `git push origin vX.Y.Z`.
3. The [release workflow](.github/workflows/release.yml) creates the GitHub Release and force-updates the floating `v1` tag.

Version conventions: patch = bug fix, minor = new feature, major = breaking. Consumers pin via SHA (most stable), `@v1` (floating major), or `@vX.Y.Z` (exact). Development → `@main`.

## Conventions

- No LLM-isms in commits, docs, or code. Direct, factual language. See the reference consumer's [AGENTS.md § Style](https://github.com/bitcomplete/bc-agentic-marketplace/blob/main/AGENTS.md#style).
- POSIX-compatible shell (`#!/bin/sh`, `[ ]` not `[[ ]]`) where possible; bash is fine in GH Actions `run:` blocks.
- Minimal permissions per job (`contents: read` unless write is genuinely needed).
- Never log secrets.

## When you need context this file doesn't give you

Don't guess — read the linked doc. If a convention isn't captured in one of these links, flag it and add a one-line pointer here rather than duplicating the convention.
